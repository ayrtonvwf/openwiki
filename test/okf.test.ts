import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  buildFrontmatter,
  checkIndexStructure,
  checkLogStructure,
  findInvalidFrontmatter,
  findMissingOkfFields,
  generateRootIndex,
  parseFrontmatter,
  runOkfPass,
  splitFrontmatter,
  stampPage,
  verifyOkfConformance,
  type OkfState,
  type PageStampResult,
} from "../src/agent/okf.ts";
import { PERSONAL_DOC_TYPES } from "../src/constants.ts";

const OKF_FIXTURES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/agent/__fixtures__/okf",
);

describe("splitFrontmatter", () => {
  test("splits a well-formed frontmatter block from the body", () => {
    const content = '---\ntype: "Reference"\n---\nBody content.\n';

    expect(splitFrontmatter(content)).toEqual({
      frontmatter: 'type: "Reference"',
      body: "Body content.\n",
    });
  });

  test("treats a file with no leading --- as body-only", () => {
    const content = "# Just a page\n\nNo frontmatter here.\n";

    expect(splitFrontmatter(content)).toEqual({
      frontmatter: null,
      body: content,
    });
  });

  test("locates the true line-anchored closing delimiter even when a quoted value contains ---", () => {
    const content = [
      "---",
      'type: "Reference"',
      'description: "uses a --- marker inline"',
      "---",
      "Body content here.",
      "",
    ].join("\n");

    const { frontmatter, body } = splitFrontmatter(content);

    expect(frontmatter).toContain('description: "uses a --- marker inline"');
    expect(body).toBe("Body content here.\n");
  });
});

describe("buildFrontmatter / parseFrontmatter round trip", () => {
  test("round-trips a description containing a colon", () => {
    const fields = {
      type: "Reference",
      title: "Colon Test",
      description: "Format: key: value pairs",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    const block = buildFrontmatter(fields);
    const { frontmatter } = splitFrontmatter(`${block}Body.\n`);

    expect(parseFrontmatter(frontmatter)).toEqual(fields);
  });

  test("tolerates an empty frontmatter block", () => {
    expect(parseFrontmatter(null)).toEqual({});
    expect(parseFrontmatter("")).toEqual({});
    expect(parseFrontmatter("   ")).toEqual({});
  });

  test("returns null for unparseable YAML", () => {
    const content = '---\ntype: "Architecture\n---\nBody\n';
    const { frontmatter } = splitFrontmatter(content);

    expect(parseFrontmatter(frontmatter)).toBeNull();
  });
});

describe("stampPage", () => {
  const now = "2026-07-08T00:00:00.000Z";

  test("injects a frontmatter block on a page with none", () => {
    const content =
      "# Credentials and Updates\n\nThis page describes how OpenWiki stores credentials and schedules updates.\n";

    const stamped = stampPage(
      "operations/credentials-and-updates.md",
      content,
      now,
    );

    expect(stamped.type).toBe("Operations");
    expect(stamped.typeIsFallback).toBe(false);
    expect(stamped.title).toBe("Credentials and Updates");
    expect(stamped.description).toBe(
      "This page describes how OpenWiki stores credentials and schedules updates.",
    );

    const { frontmatter, body } = splitFrontmatter(stamped.content);
    const fields = parseFrontmatter(frontmatter);

    expect(fields).toMatchObject({
      type: "Operations",
      title: "Credentials and Updates",
      timestamp: now,
    });
    expect(body).toBe(content);
  });

  test("recomputes type/title/description from a stale prior frontmatter block, preserving timestamp", () => {
    const content = [
      "---",
      'type: "Reference"',
      'title: "Old Title"',
      'description: "Old description."',
      'timestamp: "2020-01-01T00:00:00.000Z"',
      "---",
      "# New Heading",
      "",
      "Fresh paragraph text here.",
      "",
    ].join("\n");

    const stamped = stampPage("architecture/overview.md", content, now);

    expect(stamped.type).toBe("Architecture");
    expect(stamped.title).toBe("New Heading");
    expect(stamped.description).toBe("Fresh paragraph text here.");

    const fields = parseFrontmatter(
      splitFrontmatter(stamped.content).frontmatter,
    );
    expect(fields?.timestamp).toBe("2020-01-01T00:00:00.000Z");
  });

  test("falls back to the Reference type for an unrecognized directory and flags it", () => {
    const stamped = stampPage("misc/notes.md", "# Notes\n\nSome notes.\n", now);

    expect(stamped.type).toBe("Reference");
    expect(stamped.typeIsFallback).toBe(true);
  });

  test("derives the title from the filename when no heading is present", () => {
    const stamped = stampPage(
      "architecture/api-reference-notes.md",
      "Just prose, no heading.\n",
      now,
    );

    expect(stamped.title).toBe("Api Reference Notes");
  });

  test("preserves an existing resource field", () => {
    const content = [
      "---",
      'type: "Reference"',
      'resource: "/src/agent/okf.ts"',
      "---",
      "# Page",
      "",
      "Body.",
      "",
    ].join("\n");

    const stamped = stampPage("reference/okf.md", content, now);
    const fields = parseFrontmatter(
      splitFrontmatter(stamped.content).frontmatter,
    );

    expect(fields?.resource).toBe("/src/agent/okf.ts");
  });

  test("does not truncate the description at an abbreviation like e.g. or i.e.", () => {
    const content =
      "# Config\n\nUses e.g. an example value, i.e. a placeholder, before the real sentence ends here.\n";

    const stamped = stampPage("reference/config.md", content, now);

    expect(stamped.description).toBe(
      "Uses e.g. an example value, i.e. a placeholder, before the real sentence ends here.",
    );
  });

  test("ignores a # comment inside a fenced code block when extracting the title", () => {
    const content = [
      "```bash",
      "# Not a heading, just a shell comment",
      "```",
      "",
      "# Real Heading",
      "",
      "Body paragraph.",
      "",
    ].join("\n");

    const stamped = stampPage("reference/fenced.md", content, now);

    expect(stamped.title).toBe("Real Heading");
  });

  test("ignores a blank line inside a fenced code block when extracting the description", () => {
    const content = [
      "# Fenced Example",
      "",
      "```text",
      "first line",
      "",
      "second line after a blank line inside the fence",
      "```",
      "",
      "This is the real first paragraph.",
      "",
    ].join("\n");

    const stamped = stampPage("reference/fenced-paragraph.md", content, now);

    expect(stamped.description).toBe("This is the real first paragraph.");
  });
});

describe("validation helpers", () => {
  test("findMissingOkfFields flags a missing frontmatter block", () => {
    expect(findMissingOkfFields("# No frontmatter\n")).toBe(
      "missing frontmatter block",
    );
  });

  test("findMissingOkfFields flags an empty type field", () => {
    const content = '---\ntype: ""\n---\nBody\n';

    expect(findMissingOkfFields(content)).toBe("missing non-empty type field");
  });

  test("findMissingOkfFields passes a page with a non-empty type", () => {
    const content = '---\ntype: "Reference"\n---\nBody\n';

    expect(findMissingOkfFields(content)).toBeNull();
  });

  test("findInvalidFrontmatter flags unparseable YAML", () => {
    const content = '---\ntype: "Architecture\n---\nBody\n';

    expect(findInvalidFrontmatter(content)).toBe(
      "frontmatter block is not valid YAML",
    );
  });

  test("findInvalidFrontmatter passes valid frontmatter and no-frontmatter content", () => {
    expect(
      findInvalidFrontmatter('---\ntype: "Reference"\n---\nBody\n'),
    ).toBeNull();
    expect(findInvalidFrontmatter("Body only\n")).toBeNull();
  });

  test("checkIndexStructure requires okf_version on the root index.md", () => {
    expect(checkIndexStructure("index.md", "No frontmatter here\n")).toMatch(
      /okf_version/u,
    );
    expect(
      checkIndexStructure("index.md", '---\nokf_version: "0.1"\n---\nBody\n'),
    ).toBeNull();
  });

  test("checkIndexStructure rejects frontmatter on a non-root index.md", () => {
    expect(
      checkIndexStructure(
        "architecture/index.md",
        '---\nokf_version: "0.1"\n---\nBody\n',
      ),
    ).toMatch(/non-root/u);
    expect(
      checkIndexStructure("architecture/index.md", "Body only\n"),
    ).toBeNull();
  });

  test("checkIndexStructure ignores non-index files", () => {
    expect(
      checkIndexStructure("architecture/overview.md", "Body\n"),
    ).toBeNull();
  });
});

describe("generateRootIndex", () => {
  test("generates a frontmatter block with okf_version and links every stamped page", () => {
    const stampedPages: PageStampResult[] = [
      {
        relativePath: "quickstart.md",
        content: "",
        title: "Quickstart",
        description: "Start here.",
        type: "Repository Overview",
        typeIsFallback: false,
        bodyHash: "hash-quickstart",
        timestamp: "2026-07-08T00:00:00.000Z",
      },
      {
        relativePath: "architecture/overview.md",
        content: "",
        title: "Architecture Overview",
        description: "Explains the architecture.",
        type: "Architecture",
        typeIsFallback: false,
        bodyHash: "hash-overview",
        timestamp: "2026-07-08T00:00:00.000Z",
      },
    ];

    const index = generateRootIndex(stampedPages);

    expect(checkIndexStructure("index.md", index)).toBeNull();
    expect(index).toContain("[Quickstart](/quickstart.md)");
    expect(index).toContain(
      "[Architecture Overview](/architecture/overview.md): Explains the architecture.",
    );
  });

  test("omits stale entries when regenerated from a smaller page set", () => {
    const index = generateRootIndex([
      {
        relativePath: "quickstart.md",
        content: "",
        title: "Quickstart",
        description: "Start here.",
        type: "Repository Overview",
        typeIsFallback: false,
        bodyHash: "hash-quickstart",
        timestamp: "2026-07-08T00:00:00.000Z",
      },
    ]);

    expect(index).not.toContain("architecture/overview.md");
  });
});

describe("checkLogStructure", () => {
  test("rejects a log.md carrying a frontmatter block", () => {
    expect(
      checkLogStructure("log.md", '---\ntype: "Reference"\n---\nBody\n'),
    ).toMatch(/frontmatter/u);
  });

  test("accepts a log.md with no frontmatter block", () => {
    expect(checkLogStructure("log.md", "# Change Log\n")).toBeNull();
  });

  test("ignores non-log files", () => {
    expect(checkLogStructure("architecture/overview.md", "Body\n")).toBeNull();
  });
});

async function createOpenWikiFixture(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "openwiki-okf-"));
  await mkdir(path.join(repo, "openwiki", "architecture"), {
    recursive: true,
  });
  await writeFile(
    path.join(repo, "openwiki", "quickstart.md"),
    "# Quickstart\n\nA short factual intro sentence.\n",
    "utf8",
  );
  await writeFile(
    path.join(repo, "openwiki", "architecture", "overview.md"),
    "# Overview\n\nDescribes the system architecture.\n",
    "utf8",
  );

  return repo;
}

const TEST_RUN_INFO = { command: "init" as const, changeSummary: "test run" };

describe("runOkfPass", () => {
  test("stamps pages, generates root index.md, and reports conformance", async () => {
    const repo = await createOpenWikiFixture();

    const report = await runOkfPass(repo, TEST_RUN_INFO);

    expect(report.conformant).toBe(true);
    expect(report.issues).toEqual([]);

    const quickstart = await readFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "utf8",
    );
    const { frontmatter } = splitFrontmatter(quickstart);
    expect(parseFrontmatter(frontmatter)).toMatchObject({
      type: "Repository Overview",
      title: "Quickstart",
    });

    const index = await readFile(
      path.join(repo, "openwiki", "index.md"),
      "utf8",
    );
    expect(checkIndexStructure("index.md", index)).toBeNull();
    expect(index).toContain("[Overview](/architecture/overview.md)");
  });

  test("is idempotent: a second run with no edits leaves files byte-for-byte unchanged", async () => {
    const repo = await createOpenWikiFixture();

    await runOkfPass(repo, TEST_RUN_INFO);

    const quickstartPath = path.join(repo, "openwiki", "quickstart.md");
    const overviewPath = path.join(
      repo,
      "openwiki",
      "architecture",
      "overview.md",
    );
    const indexPath = path.join(repo, "openwiki", "index.md");

    const before = {
      quickstart: await readFile(quickstartPath, "utf8"),
      overview: await readFile(overviewPath, "utf8"),
      index: await readFile(indexPath, "utf8"),
      quickstartMtime: (await stat(quickstartPath)).mtimeMs,
    };

    const secondReport = await runOkfPass(repo, TEST_RUN_INFO);

    expect(secondReport.conformant).toBe(true);
    expect(await readFile(quickstartPath, "utf8")).toBe(before.quickstart);
    expect(await readFile(overviewPath, "utf8")).toBe(before.overview);
    expect(await readFile(indexPath, "utf8")).toBe(before.index);
    expect((await stat(quickstartPath)).mtimeMs).toBe(before.quickstartMtime);
  });

  test("stamps a personal-mode sources/ page with a personal type while a code-mode operations/ page keeps its code type", async () => {
    const personalRepo = await mkdtemp(
      path.join(tmpdir(), "openwiki-okf-personal-"),
    );
    await mkdir(path.join(personalRepo, "openwiki", "sources"), {
      recursive: true,
    });
    await writeFile(
      path.join(personalRepo, "openwiki", "quickstart.md"),
      "# Quickstart\n\nA short factual intro sentence.\n",
      "utf8",
    );
    await writeFile(
      path.join(personalRepo, "openwiki", "sources", "gmail.md"),
      "# Gmail\n\nNotes gathered from the Gmail connector.\n",
      "utf8",
    );

    await runOkfPass(personalRepo, TEST_RUN_INFO, PERSONAL_DOC_TYPES);

    const sourcePage = await readFile(
      path.join(personalRepo, "openwiki", "sources", "gmail.md"),
      "utf8",
    );
    expect(
      parseFrontmatter(splitFrontmatter(sourcePage).frontmatter),
    ).toMatchObject({ type: "Source" });

    const codeRepo = await createOpenWikiFixture();
    await mkdir(path.join(codeRepo, "openwiki", "operations"), {
      recursive: true,
    });
    await writeFile(
      path.join(codeRepo, "openwiki", "operations", "deploy.md"),
      "# Deploy\n\nHow to deploy the service.\n",
      "utf8",
    );

    await runOkfPass(codeRepo, TEST_RUN_INFO);

    const operationsPage = await readFile(
      path.join(codeRepo, "openwiki", "operations", "deploy.md"),
      "utf8",
    );
    expect(
      parseFrontmatter(splitFrontmatter(operationsPage).frontmatter),
    ).toMatchObject({ type: "Operations" });
  });

  test("flags a fallback type classification without failing conformance", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "openwiki-okf-fallback-"));
    await mkdir(path.join(repo, "openwiki", "misc"), { recursive: true });
    await writeFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "# Quickstart\n\nIntro.\n",
      "utf8",
    );
    await writeFile(
      path.join(repo, "openwiki", "misc", "notes.md"),
      "# Notes\n\nSome notes.\n",
      "utf8",
    );

    const report = await runOkfPass(repo, TEST_RUN_INFO);

    expect(report.conformant).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        file: "misc/notes.md",
        severity: "warning",
      }),
    );
  });

  test("assigns a fresh timestamp only to a page whose body genuinely changed across runs", async () => {
    const repo = await createOpenWikiFixture();
    const overviewPath = path.join(
      repo,
      "openwiki",
      "architecture",
      "overview.md",
    );

    await runOkfPass(repo, TEST_RUN_INFO);
    const quickstartAfterFirst = parseFrontmatter(
      splitFrontmatter(
        await readFile(path.join(repo, "openwiki", "quickstart.md"), "utf8"),
      ).frontmatter,
    );
    const overviewAfterFirst = parseFrontmatter(
      splitFrontmatter(await readFile(overviewPath, "utf8")).frontmatter,
    );

    await writeFile(
      overviewPath,
      "# Overview\n\nDescribes the system architecture, now revised.\n",
      "utf8",
    );

    await runOkfPass(repo, TEST_RUN_INFO);
    const quickstartAfterSecond = parseFrontmatter(
      splitFrontmatter(
        await readFile(path.join(repo, "openwiki", "quickstart.md"), "utf8"),
      ).frontmatter,
    );
    const overviewAfterSecond = parseFrontmatter(
      splitFrontmatter(await readFile(overviewPath, "utf8")).frontmatter,
    );

    expect(quickstartAfterSecond?.timestamp).toBe(
      quickstartAfterFirst?.timestamp,
    );
    expect(overviewAfterSecond?.timestamp).not.toBe(
      overviewAfterFirst?.timestamp,
    );
  });

  test("migration: seeds state from an existing frontmatter timestamp instead of bumping it", async () => {
    const repo = await createOpenWikiFixture();
    const quickstartPath = path.join(repo, "openwiki", "quickstart.md");
    const staleTimestamp = "2020-01-01T00:00:00.000Z";

    await writeFile(
      quickstartPath,
      [
        "---",
        'type: "Repository Overview"',
        'title: "Quickstart"',
        'description: "Old description."',
        `timestamp: "${staleTimestamp}"`,
        "---",
        "# Quickstart",
        "",
        "A short factual intro sentence.",
        "",
      ].join("\n"),
      "utf8",
    );

    await runOkfPass(repo, TEST_RUN_INFO);

    const fields = parseFrontmatter(
      splitFrontmatter(await readFile(quickstartPath, "utf8")).frontmatter,
    );
    expect(fields?.timestamp).toBe(staleTimestamp);

    const state = JSON.parse(
      await readFile(path.join(repo, "openwiki", ".okf-state.json"), "utf8"),
    ) as OkfState;
    expect(state.pages["quickstart.md"].timestamp).toBe(staleTimestamp);
  });

  test("preserves a producer-added frontmatter key across re-stamps with deterministic key order", async () => {
    const repo = await createOpenWikiFixture();
    const overviewPath = path.join(
      repo,
      "openwiki",
      "architecture",
      "overview.md",
    );

    await writeFile(
      overviewPath,
      [
        "---",
        'resource: "/src/agent/okf.ts"',
        'type: "Reference"',
        "---",
        "# Overview",
        "",
        "Describes the system architecture.",
        "",
      ].join("\n"),
      "utf8",
    );

    await runOkfPass(repo, TEST_RUN_INFO);

    const stamped = await readFile(overviewPath, "utf8");
    const { frontmatter } = splitFrontmatter(stamped);
    const fields = parseFrontmatter(frontmatter);

    expect(fields?.resource).toBe("/src/agent/okf.ts");
    expect(frontmatter?.trimStart().startsWith("type:")).toBe(true);

    const secondReport = await runOkfPass(repo, TEST_RUN_INFO);
    expect(secondReport.conformant).toBe(true);
    expect(await readFile(overviewPath, "utf8")).toBe(stamped);
  });

  test("a no-op update (no body edits) leaves pages, index.md, the state file, and log.md byte-for-byte unchanged", async () => {
    const repo = await createOpenWikiFixture();

    await runOkfPass(repo, TEST_RUN_INFO);

    const statePath = path.join(repo, "openwiki", ".okf-state.json");
    const logPath = path.join(repo, "openwiki", "log.md");
    const before = {
      state: await readFile(statePath, "utf8"),
      stateMtime: (await stat(statePath)).mtimeMs,
      log: await readFile(logPath, "utf8"),
      logMtime: (await stat(logPath)).mtimeMs,
    };

    const secondReport = await runOkfPass(repo, TEST_RUN_INFO);

    expect(secondReport.conformant).toBe(true);
    expect(await readFile(statePath, "utf8")).toBe(before.state);
    expect((await stat(statePath)).mtimeMs).toBe(before.stateMtime);
    expect(await readFile(logPath, "utf8")).toBe(before.log);
    expect((await stat(logPath)).mtimeMs).toBe(before.logMtime);
  });

  test("prepends a dated, newest-first log.md entry on a content-changing run without a frontmatter block", async () => {
    const repo = await createOpenWikiFixture();

    await runOkfPass(repo, {
      command: "init",
      changeSummary: "initial generation",
    });

    const logPath = path.join(repo, "openwiki", "log.md");
    const firstLog = await readFile(logPath, "utf8");
    expect(checkLogStructure("log.md", firstLog)).toBeNull();
    expect(firstLog).toContain("init: initial generation");

    await writeFile(
      path.join(repo, "openwiki", "architecture", "overview.md"),
      "# Overview\n\nDescribes the system architecture, revised.\n",
      "utf8",
    );

    await runOkfPass(repo, {
      command: "update",
      changeSummary: "revised overview",
    });

    const secondLog = await readFile(logPath, "utf8");
    expect(secondLog).toContain("update: revised overview");
    expect(secondLog).toContain("init: initial generation");
    expect(secondLog.indexOf("update: revised overview")).toBeLessThan(
      secondLog.indexOf("init: initial generation"),
    );
  });

  test("groups same-day entries under one heading, newest entry first", async () => {
    const repo = await createOpenWikiFixture();

    await runOkfPass(repo, { command: "init", changeSummary: "first run" });
    await writeFile(
      path.join(repo, "openwiki", "architecture", "overview.md"),
      "# Overview\n\nDescribes the system architecture, revised again.\n",
      "utf8",
    );
    await runOkfPass(repo, { command: "update", changeSummary: "second run" });

    const log = await readFile(path.join(repo, "openwiki", "log.md"), "utf8");
    const headingMatches = [...log.matchAll(/^## \d{4}-\d{2}-\d{2}$/gmu)];

    expect(headingMatches).toHaveLength(1);
    expect(log.indexOf("update: second run")).toBeLessThan(
      log.indexOf("init: first run"),
    );
  });

  test("prunes state entries for pages that no longer exist", async () => {
    const repo = await createOpenWikiFixture();
    const overviewPath = path.join(
      repo,
      "openwiki",
      "architecture",
      "overview.md",
    );
    const statePath = path.join(repo, "openwiki", ".okf-state.json");

    await runOkfPass(repo, TEST_RUN_INFO);
    const stateAfterFirst = JSON.parse(
      await readFile(statePath, "utf8"),
    ) as OkfState;
    expect(stateAfterFirst.pages["architecture/overview.md"]).toBeDefined();

    await rm(overviewPath);
    await runOkfPass(repo, TEST_RUN_INFO);

    const stateAfterSecond = JSON.parse(
      await readFile(statePath, "utf8"),
    ) as OkfState;
    expect(stateAfterSecond.pages["architecture/overview.md"]).toBeUndefined();
    expect(stateAfterSecond.pages["quickstart.md"]).toBeDefined();
  });

  test("tolerates a corrupt state file by falling back to empty state instead of failing the pass", async () => {
    const repo = await createOpenWikiFixture();

    await mkdir(path.join(repo, "openwiki"), { recursive: true });
    await writeFile(
      path.join(repo, "openwiki", ".okf-state.json"),
      "{ not valid json",
      "utf8",
    );

    const report = await runOkfPass(repo, TEST_RUN_INFO);

    expect(report.conformant).toBe(true);

    const state = JSON.parse(
      await readFile(path.join(repo, "openwiki", ".okf-state.json"), "utf8"),
    ) as OkfState;
    expect(state.pages["quickstart.md"]).toBeDefined();
  });

  test("re-stamps a page with an unquoted producer key byte-for-byte identically on the second run", async () => {
    const repo = await createOpenWikiFixture();
    const overviewPath = path.join(
      repo,
      "openwiki",
      "architecture",
      "overview.md",
    );

    await writeFile(
      overviewPath,
      [
        "---",
        "resource: /src/agent/okf.ts",
        "---",
        "# Overview",
        "",
        "Describes the system architecture.",
        "",
      ].join("\n"),
      "utf8",
    );

    await runOkfPass(repo, TEST_RUN_INFO);
    const stampedOnce = await readFile(overviewPath, "utf8");

    await runOkfPass(repo, TEST_RUN_INFO);
    const stampedTwice = await readFile(overviewPath, "utf8");

    expect(stampedTwice).toBe(stampedOnce);
  });
});

async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

describe("verifyOkfConformance", () => {
  test("reports a pass on the conformant fixture and does not modify any file", async () => {
    const bundleRoot = path.join(OKF_FIXTURES_ROOT, "conformant");
    const files = await listFilesRecursively(bundleRoot);
    const before = await Promise.all(
      files.map(async (file) => ({
        file,
        content: await readFile(file, "utf8"),
        mtimeMs: (await stat(file)).mtimeMs,
      })),
    );

    const report = await verifyOkfConformance(bundleRoot);

    expect(report).toEqual({ conformant: true, issues: [] });

    for (const snapshot of before) {
      expect(await readFile(snapshot.file, "utf8")).toBe(snapshot.content);
      expect((await stat(snapshot.file)).mtimeMs).toBe(snapshot.mtimeMs);
    }
  });

  test("reports the expected issue on each nonconformant variant without repairing it", async () => {
    const missingFrontmatterReport = await verifyOkfConformance(
      path.join(OKF_FIXTURES_ROOT, "nonconformant/missing-frontmatter"),
    );
    expect(missingFrontmatterReport.conformant).toBe(false);
    expect(missingFrontmatterReport.issues).toContainEqual(
      expect.objectContaining({
        file: "architecture/overview.md",
        message: "missing frontmatter block",
        severity: "error",
      }),
    );

    const emptyTypeReport = await verifyOkfConformance(
      path.join(OKF_FIXTURES_ROOT, "nonconformant/empty-type"),
    );
    expect(emptyTypeReport.conformant).toBe(false);
    expect(emptyTypeReport.issues).toContainEqual(
      expect.objectContaining({
        file: "architecture/overview.md",
        message: "missing non-empty type field",
        severity: "error",
      }),
    );

    const unparseableReport = await verifyOkfConformance(
      path.join(OKF_FIXTURES_ROOT, "nonconformant/unparseable"),
    );
    expect(unparseableReport.conformant).toBe(false);
    expect(unparseableReport.issues).toContainEqual(
      expect.objectContaining({
        file: "architecture/overview.md",
        message: "frontmatter block is not valid YAML",
        severity: "error",
      }),
    );

    expect(
      await readFile(
        path.join(
          OKF_FIXTURES_ROOT,
          "nonconformant/missing-frontmatter/openwiki/architecture/overview.md",
        ),
        "utf8",
      ),
    ).toBe("# Overview\n\nDescribes the system architecture.\n");
  });

  test("a bundle freshly produced by runOkfPass passes verifyOkfConformance with zero issues", async () => {
    const repo = await createOpenWikiFixture();

    await runOkfPass(repo, TEST_RUN_INFO);

    expect(await verifyOkfConformance(repo)).toEqual({
      conformant: true,
      issues: [],
    });
  });
});
