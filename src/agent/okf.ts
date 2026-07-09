import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  getRepoDocTypeForDirectory,
  OKF_LOG_HEADER,
  OKF_LOG_PATH,
  OKF_STATE_PATH,
  OKF_VERSION,
  OPEN_WIKI_DIR,
} from "../constants.js";
import { isFileNotFoundError } from "../fs-errors.js";
import type { OpenWikiCommand } from "./types.js";
import { walkOpenWikiMarkdownFiles } from "./utils.js";

export type Frontmatter = Record<string, unknown>;

export type OkfConformanceIssue = {
  file: string;
  message: string;
  severity: "error" | "warning";
};

export type OkfConformanceReport = {
  conformant: boolean;
  issues: OkfConformanceIssue[];
};

const OPENING_DELIMITER_PATTERN = /^---\r?\n/u;
const HEADING_PATTERN = /^# +(.+?) *$/mu;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/u;
const SENTENCE_BOUNDARY_PATTERN = /[.!?](?=\s|$)/gu;
const SENTENCE_ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "vs.", "cf."];

/**
 * Splits off a leading frontmatter block by requiring the opening `---` at
 * the absolute start of the file and the closing `---` to be a line that is
 * exactly "---" (line-anchored equality, not a substring search), so a
 * quoted scalar value containing the literal text "---" can never be
 * mistaken for the closing delimiter, and a markdown horizontal rule later
 * in the file can never be mistaken for an opening delimiter.
 */
export function splitFrontmatter(content: string): {
  frontmatter: string | null;
  body: string;
} {
  const openingMatch = OPENING_DELIMITER_PATTERN.exec(content);

  if (!openingMatch) {
    return { frontmatter: null, body: content };
  }

  const lines = content.slice(openingMatch[0].length).split(/\r?\n/u);
  const closingLineIndex = lines.indexOf("---");

  if (closingLineIndex === -1) {
    return { frontmatter: null, body: content };
  }

  return {
    frontmatter: lines.slice(0, closingLineIndex).join("\n"),
    body: lines.slice(closingLineIndex + 1).join("\n"),
  };
}

/**
 * Returns `null` when `raw` is present but fails to parse as YAML, so
 * callers can distinguish "no frontmatter" ({}) from "unparseable
 * frontmatter" (null).
 */
export function parseFrontmatter(raw: string | null): Frontmatter | null {
  if (raw === null || raw.trim().length === 0) {
    return {};
  }

  try {
    const parsed: unknown = parseYaml(raw);

    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

export function buildFrontmatter(fields: Frontmatter): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

  return `---\n${lines.join("\n")}\n---\n`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isReservedOkfFileName(relativePath: string): boolean {
  const base = path.basename(relativePath);

  return base === "index.md" || base === "log.md";
}

function isRootIndex(relativePath: string): boolean {
  return relativePath === "index.md";
}

function isLogFile(relativePath: string): boolean {
  return path.basename(relativePath) === "log.md";
}

function getTopLevelDirectory(relativePath: string): string {
  const separatorIndex = relativePath.indexOf("/");

  return separatorIndex === -1 ? "" : relativePath.slice(0, separatorIndex);
}

function extractTitle(body: string, relativePath: string): string {
  const match = HEADING_PATTERN.exec(stripFencedCodeBlocks(body));

  return match ? match[1].trim() : titleFromFilename(relativePath);
}

/**
 * Blanks out fenced code block lines (``` or ~~~) so a `#` comment or stray
 * blank line inside a code sample is never mistaken for a heading or a
 * paragraph boundary.
 */
function stripFencedCodeBlocks(body: string): string {
  const kept: string[] = [];
  let insideFence = false;

  for (const line of body.split(/\r?\n/u)) {
    if (FENCE_PATTERN.test(line)) {
      insideFence = !insideFence;
      continue;
    }

    if (!insideFence) {
      kept.push(line);
    }
  }

  return kept.join("\n");
}

function titleFromFilename(relativePath: string): string {
  const base = path.basename(relativePath, ".md");

  return base
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractDescription(body: string): string {
  return firstSentence(firstParagraph(body));
}

function firstParagraph(body: string): string {
  const paragraphLines: string[] = [];
  let started = false;

  for (const rawLine of stripFencedCodeBlocks(body).split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!started) {
      if (line.length === 0 || line.startsWith("#")) {
        continue;
      }

      started = true;
    }

    if (line.length === 0 || line.startsWith("#")) {
      break;
    }

    paragraphLines.push(line);
  }

  return paragraphLines.join(" ").trim();
}

/**
 * Finds the first sentence-ending punctuation mark followed by whitespace or
 * end-of-string, skipping over boundaries that are actually the trailing
 * period of a known abbreviation (e.g. "e.g.", "i.e.") so a sentence like
 * "Uses e.g. an example." isn't truncated at "Uses e.g.".
 */
function firstSentence(paragraph: string): string {
  SENTENCE_BOUNDARY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_BOUNDARY_PATTERN.exec(paragraph)) !== null) {
    const boundaryEnd = match.index + 1;

    if (!endsWithAbbreviation(paragraph, boundaryEnd)) {
      return paragraph.slice(0, boundaryEnd).trim();
    }
  }

  return paragraph.trim();
}

function endsWithAbbreviation(paragraph: string, boundaryEnd: number): boolean {
  return SENTENCE_ABBREVIATIONS.some((abbreviation) => {
    const start = boundaryEnd - abbreviation.length;

    return (
      start >= 0 &&
      paragraph.slice(start, boundaryEnd).toLowerCase() === abbreviation
    );
  });
}

export type OkfPageState = {
  bodyHash: string;
  timestamp: string;
};

export type OkfState = {
  version: 1;
  pages: Record<string, OkfPageState>;
};

/**
 * SHA-256 over the body only (the content returned by `splitFrontmatter`),
 * so the frontmatter block this pass rewrites never feeds back into the hash
 * used to detect a genuine body edit.
 */
function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Assigns a fresh `timestamp` only when the page's body genuinely changed
 * since it was last stamped (persisted state's `bodyHash` no longer matches).
 * Migration fallback: when no persisted state exists yet for the page but its
 * existing frontmatter already carries a `timestamp` (a Phase 3 wiki being
 * upgraded), that value is preserved and seeded into state instead of being
 * bumped, so enabling this pass doesn't mass-rewrite every page's timestamp.
 */
function resolveTimestamp(
  priorState: OkfPageState | undefined,
  previousFields: Frontmatter,
  bodyHash: string,
  now: string,
): string {
  if (priorState) {
    return priorState.bodyHash === bodyHash ? priorState.timestamp : now;
  }

  return typeof previousFields.timestamp === "string" &&
    previousFields.timestamp.length > 0
    ? previousFields.timestamp
    : now;
}

const MANAGED_FRONTMATTER_KEYS = [
  "type",
  "title",
  "description",
  "timestamp",
] as const;

/**
 * Builds the output frontmatter field map by starting from every key already
 * present in the page's prior frontmatter (preserving producer-added /
 * unknown keys per OKF §4.1 round-trip guidance), then overwriting the
 * code-managed keys with their freshly computed values. Managed keys are
 * emitted first in a fixed order, followed by the remaining preserved keys
 * sorted lexicographically, so re-stamping unchanged input is byte-for-byte
 * idempotent.
 */
function buildStampedFields(
  previousFields: Frontmatter,
  managed: {
    type: string;
    title: string;
    description: string;
    timestamp: string;
  },
): Frontmatter {
  const fields: Frontmatter = { ...managed };
  const managedKeys: ReadonlySet<string> = new Set(MANAGED_FRONTMATTER_KEYS);
  const preservedKeys = Object.keys(previousFields)
    .filter((key) => !managedKeys.has(key))
    .sort((left, right) => left.localeCompare(right));

  for (const key of preservedKeys) {
    fields[key] = previousFields[key];
  }

  return fields;
}

export type PageStampResult = {
  relativePath: string;
  content: string;
  title: string;
  description: string;
  type: string;
  typeIsFallback: boolean;
  bodyHash: string;
  timestamp: string;
};

/**
 * Recomputes the code-managed frontmatter fields (`type`, `title`,
 * `description`, `timestamp`) for a non-reserved page on every run, while
 * preserving any other frontmatter keys and resolving `timestamp` from
 * persisted per-page state so it only advances on a genuine body edit.
 */
export function stampPage(
  relativePath: string,
  rawContent: string,
  now: string,
  priorState?: OkfPageState,
): PageStampResult {
  const { frontmatter: rawFrontmatter, body } = splitFrontmatter(rawContent);
  const previousFields = parseFrontmatter(rawFrontmatter) ?? {};
  const bodyHash = hashBody(body);

  const { type, isFallback } = getRepoDocTypeForDirectory(
    getTopLevelDirectory(relativePath),
  );
  const title = extractTitle(body, relativePath);
  const description = extractDescription(body);
  const timestamp = resolveTimestamp(priorState, previousFields, bodyHash, now);

  const fields = buildStampedFields(previousFields, {
    type,
    title,
    description,
    timestamp,
  });

  return {
    relativePath,
    content: `${buildFrontmatter(fields)}${body}`,
    title,
    description,
    type,
    typeIsFallback: isFallback,
    bodyHash,
    timestamp,
  };
}

/**
 * Not called from `runOkfPass`: the pass's full re-stamp of every
 * non-reserved page (`stampPage`) is itself the repair for missing or
 * invalid frontmatter, so there is nothing left to flag by the time
 * validation would run. Exported for direct unit testing of the underlying
 * detection logic.
 */
export function findMissingOkfFields(content: string): string | null {
  const { frontmatter } = splitFrontmatter(content);

  if (frontmatter === null) {
    return "missing frontmatter block";
  }

  const fields = parseFrontmatter(frontmatter);

  if (fields === null) {
    return null;
  }

  return typeof fields.type === "string" && fields.type.trim().length > 0
    ? null
    : "missing non-empty type field";
}

export function findInvalidFrontmatter(content: string): string | null {
  const { frontmatter } = splitFrontmatter(content);

  if (frontmatter === null) {
    return null;
  }

  return parseFrontmatter(frontmatter) === null
    ? "frontmatter block is not valid YAML"
    : null;
}

export function checkIndexStructure(
  relativePath: string,
  content: string,
): string | null {
  if (path.basename(relativePath) !== "index.md") {
    return null;
  }

  const { frontmatter } = splitFrontmatter(content);

  if (!isRootIndex(relativePath)) {
    return frontmatter !== null
      ? "non-root index.md must not carry a frontmatter block"
      : null;
  }

  const fields = frontmatter === null ? null : parseFrontmatter(frontmatter);

  if (fields !== null && fields.okf_version === OKF_VERSION) {
    return null;
  }

  return `root index.md frontmatter must declare okf_version: ${JSON.stringify(
    OKF_VERSION,
  )}`;
}

/**
 * OKF §7 reserved change-log file: never carries a frontmatter block and is
 * exempt from the `type` requirement, since it is not a documentation page.
 */
export function checkLogStructure(
  relativePath: string,
  content: string,
): string | null {
  if (path.basename(relativePath) !== "log.md") {
    return null;
  }

  const { frontmatter } = splitFrontmatter(content);

  return frontmatter !== null
    ? "log.md must not carry a frontmatter block"
    : null;
}

/**
 * Regenerates the bundle-root index.md from the current set of stamped
 * pages, so pages removed or renamed since the last run no longer appear.
 */
export function generateRootIndex(stampedPages: PageStampResult[]): string {
  const entries = stampedPages
    .filter((page) => page.relativePath !== "quickstart.md")
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map(
      (page) => `- [${page.title}](/${page.relativePath}): ${page.description}`,
    )
    .join("\n");

  const body = [
    "# OpenWiki Index",
    "",
    "- [Quickstart](/quickstart.md)",
    ...(entries.length > 0 ? [entries] : []),
    "",
  ].join("\n");

  return `${buildFrontmatter({ okf_version: OKF_VERSION })}\n${body}`;
}

async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tempPath = `${filePath}.okf-tmp-${randomBytes(6).toString("hex")}`;

  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

/**
 * Skips the write when content is byte-for-byte unchanged, preserving
 * idempotence and the existing content-snapshot no-op optimization.
 */
async function writeIfChanged(
  filePath: string,
  content: string,
): Promise<boolean> {
  const existing = await readFileIfExists(filePath);

  if (existing === content) {
    return false;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await atomicWriteFile(filePath, content);

  return true;
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function isPlainOkfPageState(value: unknown): value is OkfPageState {
  return (
    isPlainObject(value) &&
    typeof value.bodyHash === "string" &&
    typeof value.timestamp === "string"
  );
}

/**
 * Reads the persisted OKF state file, tolerating a missing or malformed file
 * by returning empty state so a corrupt/absent state never fails the pass
 * (it just falls back to migration/fresh-timestamp behavior per page).
 */
async function readOkfState(cwd: string): Promise<OkfState> {
  const statePath = path.join(cwd, OKF_STATE_PATH);

  try {
    const raw = await readFile(statePath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isPlainObject(parsed) || parsed.version !== 1) {
      return { version: 1, pages: {} };
    }

    const rawPages = isPlainObject(parsed.pages) ? parsed.pages : {};
    const pages: Record<string, OkfPageState> = {};

    for (const [relativePath, pageState] of Object.entries(rawPages)) {
      if (isPlainOkfPageState(pageState)) {
        pages[relativePath] = pageState;
      }
    }

    return { version: 1, pages };
  } catch (error) {
    if (isFileNotFoundError(error) || error instanceof SyntaxError) {
      return { version: 1, pages: {} };
    }

    throw error;
  }
}

/**
 * Writes the OKF state file with pages in deterministic (sorted) key order,
 * via `writeIfChanged`, so an unchanged state never perturbs the content
 * snapshot's no-op detection (the file is excluded from that snapshot too).
 */
async function writeOkfState(cwd: string, state: OkfState): Promise<void> {
  const sortedPages = Object.fromEntries(
    Object.entries(state.pages).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  const content = `${JSON.stringify(
    { version: state.version, pages: sortedPages },
    null,
    2,
  )}\n`;

  await writeIfChanged(path.join(cwd, OKF_STATE_PATH), content);
}

const LOG_DATE_HEADING_PATTERN = /^## (\d{4}-\d{2}-\d{2})$/u;
const LOG_ENTRY_PATTERN = /^- (.+)$/u;

type OkfLogEntryGroup = {
  date: string;
  entries: string[];
};

/**
 * `log.md` is fully code-owned: this parser only recognizes the `## DATE`
 * heading and `- entry` line shapes this module itself writes, and
 * `serializeLogGroups` rewrites the whole file from the parsed groups on
 * every run. Any hand-added prose, custom headings, or multi-line entries
 * are silently dropped on the next `--okf` run — do not edit `log.md` by
 * hand expecting it to round-trip.
 */
function parseLogGroups(content: string | null): OkfLogEntryGroup[] {
  if (content === null) {
    return [];
  }

  const groups: OkfLogEntryGroup[] = [];
  let current: OkfLogEntryGroup | null = null;

  for (const line of content.split(/\r?\n/u)) {
    const dateMatch = LOG_DATE_HEADING_PATTERN.exec(line);

    if (dateMatch) {
      current = { date: dateMatch[1], entries: [] };
      groups.push(current);
      continue;
    }

    const entryMatch = LOG_ENTRY_PATTERN.exec(line);

    if (entryMatch && current) {
      current.entries.push(entryMatch[1]);
    }
  }

  return groups;
}

function serializeLogGroups(groups: OkfLogEntryGroup[]): string {
  const sections = groups
    .filter((group) => group.entries.length > 0)
    .map((group) =>
      [
        `## ${group.date}`,
        "",
        ...group.entries.map((entry) => `- ${entry}`),
      ].join("\n"),
    );

  return `${OKF_LOG_HEADER}\n\n${sections.join("\n\n")}\n`;
}

/**
 * Prepends a dated entry describing this run to the OKF §7 `log.md`,
 * grouping newest date first and newest entry first within a date, and
 * preserving all previously recorded history below it. Returns the
 * serialized content so the caller can both write it (via `writeIfChanged`,
 * so a run that adds no new entry never rewrites the file) and validate it.
 *
 * When the run's entry is identical to the most recent entry already
 * recorded for today, no new entry is appended: the run "added no new
 * entry" per spec, so the existing content is returned unchanged (byte for
 * byte) rather than re-serialized, so an identical re-run never duplicates
 * a line or perturbs the file on disk.
 */
async function buildUpdatedLog(
  cwd: string,
  now: string,
  runInfo: { command: OpenWikiCommand; changeSummary: string },
): Promise<string> {
  const logPath = path.join(cwd, OKF_LOG_PATH);
  const existingContent = await readFileIfExists(logPath);
  const groups = parseLogGroups(existingContent);
  const today = now.slice(0, 10);
  const entry = `${runInfo.command}: ${runInfo.changeSummary}`;
  const latestGroup = groups[0];

  if (
    latestGroup?.date === today &&
    latestGroup.entries[0] === entry &&
    existingContent !== null
  ) {
    return existingContent;
  }

  if (latestGroup?.date === today) {
    latestGroup.entries.unshift(entry);
  } else {
    groups.unshift({ date: today, entries: [entry] });
  }

  return serializeLogGroups(groups);
}

/**
 * Stamps/refreshes frontmatter on every non-reserved page, regenerates the
 * root index.md, records a `log.md` entry, and validates the result against
 * OKF §9. Always attempts to repair what it can (the full re-stamp is itself
 * the repair) and never throws on a non-conformant result.
 */
export async function runOkfPass(
  cwd: string,
  runInfo: { command: OpenWikiCommand; changeSummary: string },
): Promise<OkfConformanceReport> {
  const now = new Date().toISOString();
  const openWikiDir = path.join(cwd, OPEN_WIKI_DIR);
  const relativePaths = await walkOpenWikiMarkdownFiles(cwd);
  const state = await readOkfState(cwd);
  const nextPages: Record<string, OkfPageState> = {};

  const issues: OkfConformanceIssue[] = [];
  const stampedPages: PageStampResult[] = [];

  for (const relativePath of relativePaths) {
    if (isReservedOkfFileName(relativePath)) {
      continue;
    }

    const absolutePath = path.join(openWikiDir, relativePath);
    const rawContent = await readFile(absolutePath, "utf8");
    const stamped = stampPage(
      relativePath,
      rawContent,
      now,
      state.pages[relativePath],
    );

    stampedPages.push(stamped);
    nextPages[relativePath] = {
      bodyHash: stamped.bodyHash,
      timestamp: stamped.timestamp,
    };
    await writeIfChanged(absolutePath, stamped.content);

    if (stamped.typeIsFallback) {
      issues.push({
        file: relativePath,
        message:
          `type inferred by fallback (${stamped.type}); ` +
          "verify directory placement",
        severity: "warning",
      });
    }
  }

  await writeOkfState(cwd, { version: 1, pages: nextPages });

  for (const relativePath of relativePaths) {
    if (
      !isReservedOkfFileName(relativePath) ||
      isRootIndex(relativePath) ||
      isLogFile(relativePath)
    ) {
      continue;
    }

    const absolutePath = path.join(openWikiDir, relativePath);
    const content = await readFile(absolutePath, "utf8");
    const issue = checkIndexStructure(relativePath, content);

    if (issue) {
      issues.push({ file: relativePath, message: issue, severity: "error" });
    }
  }

  const rootIndexContent = generateRootIndex(stampedPages);
  await writeIfChanged(path.join(openWikiDir, "index.md"), rootIndexContent);

  const rootIndexIssue = checkIndexStructure("index.md", rootIndexContent);

  if (rootIndexIssue) {
    issues.push({
      file: "index.md",
      message: rootIndexIssue,
      severity: "error",
    });
  }

  const logContent = await buildUpdatedLog(cwd, now, runInfo);
  await writeIfChanged(path.join(openWikiDir, "log.md"), logContent);

  const logIssue = checkLogStructure("log.md", logContent);

  if (logIssue) {
    issues.push({ file: "log.md", message: logIssue, severity: "error" });
  }

  return {
    conformant: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

/**
 * Repair-disabled counterpart to `runOkfPass`: inspects the bundle exactly as
 * it exists on disk and never calls `stampPage` or `writeIfChanged`, so a
 * missing/invalid frontmatter block or malformed reserved file is reported
 * rather than repaired. Uses the same leaf check helpers (`checkIndexStructure`,
 * `checkLogStructure`, and the frontmatter/field checks below) that `stampPage`
 * must satisfy in the generate pass, so the two entry points are kept aligned
 * on what "conformant" means without duplicating the validation logic.
 */
export async function verifyOkfConformance(
  cwd: string,
): Promise<OkfConformanceReport> {
  const openWikiDir = path.join(cwd, OPEN_WIKI_DIR);
  const relativePaths = await walkOpenWikiMarkdownFiles(cwd);
  const issues: OkfConformanceIssue[] = [];
  let hasRootIndex = false;

  for (const relativePath of relativePaths) {
    const content = await readFile(
      path.join(openWikiDir, relativePath),
      "utf8",
    );

    if (isRootIndex(relativePath)) {
      hasRootIndex = true;
    }

    if (isReservedOkfFileName(relativePath)) {
      const issue = isLogFile(relativePath)
        ? checkLogStructure(relativePath, content)
        : checkIndexStructure(relativePath, content);

      if (issue) {
        issues.push({ file: relativePath, message: issue, severity: "error" });
      }

      continue;
    }

    const missingFieldsIssue = findMissingOkfFields(content);

    if (missingFieldsIssue) {
      issues.push({
        file: relativePath,
        message: missingFieldsIssue,
        severity: "error",
      });
    }

    const invalidFrontmatterIssue = findInvalidFrontmatter(content);

    if (invalidFrontmatterIssue) {
      issues.push({
        file: relativePath,
        message: invalidFrontmatterIssue,
        severity: "error",
      });
    }
  }

  if (!hasRootIndex) {
    issues.push({
      file: "index.md",
      message: "missing root index.md",
      severity: "error",
    });
  }

  return {
    conformant: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}
