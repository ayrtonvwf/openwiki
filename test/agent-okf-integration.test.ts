import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseFrontmatter, splitFrontmatter } from "../src/agent/okf.ts";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENWIKI_PROVIDER"] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnv.get(key);

    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
});

const QUICKSTART_CONTENT = "# Quickstart\n\nA short factual intro sentence.\n";
const OVERVIEW_CONTENT = "# Overview\n\nDescribes the system architecture.\n";

vi.mock("../src/env.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/env.ts")>();

  return {
    ...actual,
    loadOpenWikiEnv: () => Promise.resolve({}),
    openWikiEnvDir: path.join(os.tmpdir(), "openwiki-okf-integration-envdir"),
  };
});

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class FakeChatAnthropic {},
}));

vi.mock("@langchain/langgraph-checkpoint-sqlite", () => ({
  SqliteSaver: {
    fromConnString: () => ({}),
  },
}));

vi.mock("deepagents", () => ({
  createDeepAgent: (options: { backend: { rootDir: string } }) => ({
    stream: async () => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const nodePath = await import("node:path");
      const cwd = options.backend.rootDir;

      await mkdir(nodePath.join(cwd, "openwiki", "architecture"), {
        recursive: true,
      });
      await writeFile(
        nodePath.join(cwd, "openwiki", "quickstart.md"),
        "# Quickstart\n\nA short factual intro sentence.\n",
        "utf8",
      );
      await writeFile(
        nodePath.join(cwd, "openwiki", "architecture", "overview.md"),
        "# Overview\n\nDescribes the system architecture.\n",
        "utf8",
      );

      return [];
    },
  }),
  LocalShellBackend: class FakeLocalShellBackend {
    rootDir: string;

    constructor(options: { rootDir: string }) {
      this.rootDir = options.rootDir;
    }
  },
}));

const { runOpenWikiAgent } = await import("../src/agent/index.ts");

async function createTempRepo(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "openwiki-okf-agent-"));
}

describe("runOpenWikiAgent OKF integration", () => {
  test("okf: true wires runOkfPass into a real run and stamps the output", async () => {
    process.env.OPENWIKI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const repo = await createTempRepo();

    const result = await runOpenWikiAgent("init", repo, {
      modelId: "test-model",
      okf: true,
    });

    expect(result.okfConformant).toBe(true);

    const quickstart = await readFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "utf8",
    );
    const quickstartFields = parseFrontmatter(
      splitFrontmatter(quickstart).frontmatter,
    );
    expect(quickstartFields).toMatchObject({
      type: "Repository Overview",
      title: "Quickstart",
    });

    const overview = await readFile(
      path.join(repo, "openwiki", "architecture", "overview.md"),
      "utf8",
    );
    const overviewFields = parseFrontmatter(
      splitFrontmatter(overview).frontmatter,
    );
    expect(overviewFields).toMatchObject({ type: "Architecture" });

    const index = await readFile(
      path.join(repo, "openwiki", "index.md"),
      "utf8",
    );
    expect(index).toContain('okf_version: "0.1"');
    expect(index).toContain("[Overview](/architecture/overview.md)");

    const log = await readFile(
      path.join(repo, "openwiki", "log.md"),
      "utf8",
    );
    expect(log).toMatch(/^- init: /mu);
    expect(log).not.toMatch(/init:\s*init:/u);
  });

  test("okf off/absent leaves output byte-for-byte unchanged (no frontmatter, no index.md)", async () => {
    process.env.OPENWIKI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const repo = await createTempRepo();

    const result = await runOpenWikiAgent("init", repo, {
      modelId: "test-model",
    });

    expect(result.okfConformant).toBeUndefined();

    const quickstart = await readFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "utf8",
    );
    expect(quickstart).toBe(QUICKSTART_CONTENT);

    const overview = await readFile(
      path.join(repo, "openwiki", "architecture", "overview.md"),
      "utf8",
    );
    expect(overview).toBe(OVERVIEW_CONTENT);

    await expect(
      readFile(path.join(repo, "openwiki", "index.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
