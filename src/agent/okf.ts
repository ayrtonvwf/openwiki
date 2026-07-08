import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  getRepoDocTypeForDirectory,
  OKF_VERSION,
  OPEN_WIKI_DIR,
} from "../constants.js";
import { isFileNotFoundError } from "../fs-errors.js";
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
const SENTENCE_PATTERN = /^(.*?[.!?])(?:\s|$)/u;

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

export function setFrontmatterField(
  fields: Frontmatter,
  key: string,
  value: unknown,
): Frontmatter {
  return { ...fields, [key]: value };
}

export function dropFrontmatterField(
  fields: Frontmatter,
  key: string,
): Frontmatter {
  const next = { ...fields };
  delete next[key];

  return next;
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

function getTopLevelDirectory(relativePath: string): string {
  const separatorIndex = relativePath.indexOf("/");

  return separatorIndex === -1 ? "" : relativePath.slice(0, separatorIndex);
}

function extractTitle(body: string, relativePath: string): string {
  const match = HEADING_PATTERN.exec(body);

  return match ? match[1].trim() : titleFromFilename(relativePath);
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

  for (const rawLine of body.split(/\r?\n/u)) {
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

function firstSentence(paragraph: string): string {
  const match = SENTENCE_PATTERN.exec(paragraph);

  return match ? match[1].trim() : paragraph;
}

/**
 * `timestamp` is preserved whenever a previously stamped value already
 * exists. Detecting a genuine cross-run body edit (vs. a same-run rerun with
 * no edits) would require persisting a body hash, which this phase
 * explicitly defers (see design.md's Non-Goals); this rule still guarantees
 * the required same-run idempotence.
 */
function resolveTimestamp(previousFields: Frontmatter, now: string): string {
  return typeof previousFields.timestamp === "string" &&
    previousFields.timestamp.length > 0
    ? previousFields.timestamp
    : now;
}

export type PageStampResult = {
  relativePath: string;
  content: string;
  title: string;
  description: string;
  type: string;
  typeIsFallback: boolean;
};

/**
 * Recomputes and overwrites the entire frontmatter block for a non-reserved
 * page on every run (design.md Decision 1), so conformance never depends on
 * the model producing a well-formed or partial block.
 */
export function stampPage(
  relativePath: string,
  rawContent: string,
  now: string,
): PageStampResult {
  const { frontmatter: rawFrontmatter, body } = splitFrontmatter(rawContent);
  const previousFields = parseFrontmatter(rawFrontmatter) ?? {};

  const { type, isFallback } = getRepoDocTypeForDirectory(
    getTopLevelDirectory(relativePath),
  );
  const title = extractTitle(body, relativePath);
  const description = extractDescription(body);
  const timestamp = resolveTimestamp(previousFields, now);

  const fields: Frontmatter = { type, title, description, timestamp };

  if (typeof previousFields.resource === "string") {
    fields.resource = previousFields.resource;
  }

  return {
    relativePath,
    content: `${buildFrontmatter(fields)}${body}`,
    title,
    description,
    type,
    typeIsFallback: isFallback,
  };
}

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
 * Regenerates the bundle-root index.md from the current set of stamped
 * pages, so pages removed or renamed since the last run no longer appear.
 */
export function generateRootIndex(stampedPages: PageStampResult[]): string {
  const entries = stampedPages
    .filter((page) => page.relativePath !== "quickstart.md")
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map(
      (page) =>
        `- [${page.title}](/${page.relativePath}): ${page.description}`,
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

/**
 * Stamps/refreshes frontmatter on every non-reserved page, regenerates the
 * root index.md, and validates the result against OKF §9. Always attempts to
 * repair what it can (the full re-stamp is itself the repair) and never
 * throws on a non-conformant result.
 */
export async function runOkfPass(cwd: string): Promise<OkfConformanceReport> {
  const now = new Date().toISOString();
  const openWikiDir = path.join(cwd, OPEN_WIKI_DIR);
  const relativePaths = await walkOpenWikiMarkdownFiles(cwd);

  const issues: OkfConformanceIssue[] = [];
  const stampedPages: PageStampResult[] = [];

  for (const relativePath of relativePaths) {
    if (isReservedOkfFileName(relativePath)) {
      continue;
    }

    const absolutePath = path.join(openWikiDir, relativePath);
    const rawContent = await readFile(absolutePath, "utf8");
    const stamped = stampPage(relativePath, rawContent, now);

    stampedPages.push(stamped);
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

  for (const relativePath of relativePaths) {
    if (!isReservedOkfFileName(relativePath) || isRootIndex(relativePath)) {
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

  for (const page of stampedPages) {
    const missingFieldIssue = findMissingOkfFields(page.content);
    const invalidFrontmatterIssue = findInvalidFrontmatter(page.content);

    for (const message of [missingFieldIssue, invalidFrontmatterIssue]) {
      if (message) {
        issues.push({ file: page.relativePath, message, severity: "error" });
      }
    }
  }

  return {
    conformant: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}
