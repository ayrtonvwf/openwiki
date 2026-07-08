import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createOpenWikiContentSnapshot,
  walkOpenWikiMarkdownFiles,
} from "../src/agent/utils.ts";

async function createOpenWikiTree(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "openwiki-walk-"));
  await mkdir(path.join(repo, "openwiki", "architecture"), {
    recursive: true,
  });
  await writeFile(
    path.join(repo, "openwiki", "quickstart.md"),
    "# Quickstart\n",
    "utf8",
  );
  await writeFile(path.join(repo, "openwiki", "index.md"), "# Index\n", "utf8");
  await writeFile(
    path.join(repo, "openwiki", "architecture", "overview.md"),
    "# Overview\n",
    "utf8",
  );
  await writeFile(
    path.join(repo, "openwiki", ".last-update.json"),
    "{}\n",
    "utf8",
  );
  return repo;
}

describe("walkOpenWikiMarkdownFiles", () => {
  test("returns only .md files under openwiki/, skipping the metadata file", async () => {
    const repo = await createOpenWikiTree();

    const files = await walkOpenWikiMarkdownFiles(repo);

    expect(files).not.toContain(".last-update.json");
    expect(files.every((file) => file.endsWith(".md"))).toBe(true);
  });

  test("returns deterministic, sorted, forward-slash nested paths", async () => {
    const repo = await createOpenWikiTree();

    const files = await walkOpenWikiMarkdownFiles(repo);

    expect(files).toEqual([
      "architecture/overview.md",
      "index.md",
      "quickstart.md",
    ]);
  });

  test("returns an empty list when openwiki/ does not exist", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "openwiki-walk-empty-"));

    const files = await walkOpenWikiMarkdownFiles(repo);

    expect(files).toEqual([]);
  });
});

describe("createOpenWikiContentSnapshot", () => {
  test("produces the same hash for an unchanged tree and a different hash after an edit", async () => {
    const repo = await createOpenWikiTree();

    const before = await createOpenWikiContentSnapshot(repo);
    const repeated = await createOpenWikiContentSnapshot(repo);
    expect(repeated).toBe(before);

    await writeFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "# Quickstart\nChanged.\n",
      "utf8",
    );

    expect(await createOpenWikiContentSnapshot(repo)).not.toBe(before);
  });

  test("ignores the update metadata file", async () => {
    const repo = await createOpenWikiTree();
    const before = await createOpenWikiContentSnapshot(repo);

    await writeFile(
      path.join(repo, "openwiki", ".last-update.json"),
      JSON.stringify({ updatedAt: "changed" }),
      "utf8",
    );

    expect(await createOpenWikiContentSnapshot(repo)).toBe(before);
  });

  test("ignores the OKF state file, so its presence/contents cannot perturb no-op detection", async () => {
    const repo = await createOpenWikiTree();
    const before = await createOpenWikiContentSnapshot(repo);

    await writeFile(
      path.join(repo, "openwiki", ".okf-state.json"),
      JSON.stringify({ version: 1, pages: { "quickstart.md": "changed" } }),
      "utf8",
    );

    expect(await createOpenWikiContentSnapshot(repo)).toBe(before);
    expect(await walkOpenWikiMarkdownFiles(repo)).not.toContain(
      ".okf-state.json",
    );
  });
});
