import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildFrontmatter,
  checkIndexStructure,
  dropFrontmatterField,
  findInvalidFrontmatter,
  findMissingOkfFields,
  generateRootIndex,
  parseFrontmatter,
  runOkfPass,
  setFrontmatterField,
  splitFrontmatter,
  stampPage,
  type PageStampResult,
} from "../src/agent/okf.ts";

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

describe("setFrontmatterField / dropFrontmatterField", () => {
  test("sets a field while preserving the others", () => {
    const fields = { type: "Reference", title: "T" };

    expect(setFrontmatterField(fields, "resource", "/path.md")).toEqual({
      type: "Reference",
      title: "T",
      resource: "/path.md",
    });
    expect(fields).toEqual({ type: "Reference", title: "T" });
  });

  test("drops a field while preserving the others", () => {
    const fields = { type: "Reference", title: "T", resource: "/path.md" };

    expect(dropFrontmatterField(fields, "resource")).toEqual({
      type: "Reference",
      title: "T",
    });
    expect(fields).toEqual({
      type: "Reference",
      title: "T",
      resource: "/path.md",
    });
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
      },
      {
        relativePath: "architecture/overview.md",
        content: "",
        title: "Architecture Overview",
        description: "Explains the architecture.",
        type: "Architecture",
        typeIsFallback: false,
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
      },
    ]);

    expect(index).not.toContain("architecture/overview.md");
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

describe("runOkfPass", () => {
  test("stamps pages, generates root index.md, and reports conformance", async () => {
    const repo = await createOpenWikiFixture();

    const report = await runOkfPass(repo);

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

    await runOkfPass(repo);

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

    const secondReport = await runOkfPass(repo);

    expect(secondReport.conformant).toBe(true);
    expect(await readFile(quickstartPath, "utf8")).toBe(before.quickstart);
    expect(await readFile(overviewPath, "utf8")).toBe(before.overview);
    expect(await readFile(indexPath, "utf8")).toBe(before.index);
    expect((await stat(quickstartPath)).mtimeMs).toBe(before.quickstartMtime);
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

    const report = await runOkfPass(repo);

    expect(report.conformant).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        file: "misc/notes.md",
        severity: "warning",
      }),
    );
  });
});
