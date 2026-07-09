import { execFile } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CLI_PATH = path.join(REPO_ROOT, "src/cli.tsx");
const TSX_BIN = path.join(REPO_ROOT, "node_modules/.bin/tsx");
const OKF_FIXTURES_ROOT = path.join(REPO_ROOT, "src/agent/__fixtures__/okf");

async function createBundleDir(fixtureName: string): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "openwiki-okf-check-cli-"));

  await cp(
    path.join(OKF_FIXTURES_ROOT, fixtureName, "openwiki"),
    path.join(repo, "openwiki"),
    { recursive: true },
  );

  return repo;
}

type OkfCheckResult = { exitCode: number; stdout: string };

async function runOkfCheck(cwd: string): Promise<OkfCheckResult> {
  try {
    const { stdout } = await execFileAsync(TSX_BIN, [CLI_PATH, "--okf-check"], {
      cwd,
      env: { ...process.env, HOME: cwd },
    });

    return { exitCode: 0, stdout };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string };

    return { exitCode: execError.code ?? 1, stdout: execError.stdout ?? "" };
  }
}

describe("openwiki --okf-check CLI", () => {
  test("exits zero and reports a pass for a conformant bundle", async () => {
    const repo = await createBundleDir("conformant");

    const result = await runOkfCheck(repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/conformant/u);
    expect(result.stdout).not.toMatch(/non-conformant/u);
  }, 20_000);

  test("exits non-zero and reports the failing file for a nonconformant bundle", async () => {
    const repo = await createBundleDir("nonconformant/missing-frontmatter");

    const result = await runOkfCheck(repo);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toMatch(/architecture\/overview\.md/u);
  }, 20_000);
});
