## 1. Repair-disabled verification in okf.ts

- [x] 1.1 Add an exported `verifyOkfConformance(cwd): Promise<OkfConformanceReport>` to `src/agent/okf.ts` that walks the bundle with `walkOpenWikiMarkdownFiles(cwd)` and validates on-disk content only — no `stampPage`, no `writeIfChanged`, no `index.md`/`log.md` generation.
- [x] 1.2 For each non-reserved page, run `findMissingOkfFields` and `findInvalidFrontmatter`, collecting an `error`-severity `OkfConformanceIssue` for a missing/empty `type` or unparseable block.
- [x] 1.3 For each reserved file, run `checkIndexStructure` (index files, incl. root) and `checkLogStructure` (`log.md`), collecting issues; report a missing root `index.md` as an issue rather than generating one.
- [x] 1.4 Compute `conformant` with the same rule as `runOkfPass` (no `error`-severity issue), returning the shared `OkfConformanceReport` shape.

## 2. `--okf-check` CLI flag and parsing

- [x] 2.1 Add `--okf-check` parsing to `parseCommand` in `src/commands.ts` and surface it on the `run` `CliCommand` (e.g. `okfCheck: boolean`), mirroring the existing `--okf` / `--no-okf` handling.
- [x] 2.2 Add a help row for `--okf-check` to `helpContent.options` and an example (e.g. `openwiki --okf-check`).

## 3. Wire verification into the CLI with a CI exit code

- [x] 3.1 In `src/cli.tsx`, when `--okf-check` is set, resolve the OpenWiki directory and call `verifyOkfConformance(cwd)` without starting the documentation agent.
- [x] 3.2 Render the report (per-file issues + overall pass/fail) via the existing status/output components so an operator sees which files failed.
- [x] 3.3 Set `process.exitCode = 1` when the report is non-conformant and `0` when conformant; leave the default `--okf` generate path's exit-code behavior unchanged.

## 4. README documentation

- [x] 4.1 Add an "OKF output" section to `README.md`: what OKF is (one line + link), enabling it (`--okf` / `--no-okf`, `OPENWIKI_OKF` env key, precedence flag > env > default-off), the reserved files (`index.md`, `log.md`), and the conformance guarantee (code owns frontmatter).
- [x] 4.2 Document the type taxonomy (from `REPO_DOC_TYPES`) and the `--okf-check` CI gate in that section.

## 5. DEVELOPMENT documentation

- [x] 5.1 Add an OKF section to `DEVELOPMENT.md` covering the code-owned-frontmatter design, `src/agent/okf.ts` responsibilities, and the `.okf-state.json` machine state (and why it is excluded from the content snapshot).
- [x] 5.2 Document how to run `--okf-check` and the OKF test suite locally.

## 6. Example workflow usage

- [x] 6.1 Add commented/opt-in `--okf` usage (and an optional `--okf-check` step) to `examples/openwiki-update.yml`.
- [x] 6.2 Add the equivalent to `examples/openwiki-update.gitlab-ci.yml`.

## 7. Conformance fixture bundle

- [x] 7.1 Add a checked-in fixture tree (e.g. `src/agent/__fixtures__/okf/`) with a `conformant/` bundle and `nonconformant/` variants (missing frontmatter; present-but-empty `type`; unparseable block).
- [x] 7.2 Ensure the fixture bundle is excluded from any production traversal (fixtures live under the test area, not `openwiki/`).

## 8. Tests

- [x] 8.1 Test `verifyOkfConformance` reports a pass on the `conformant/` fixture and does not create, modify, or delete any file (assert mtimes/contents unchanged).
- [x] 8.2 Test `verifyOkfConformance` reports the expected per-file issues on each `nonconformant/` variant without repairing it.
- [x] 8.3 Test the `--okf-check` CLI path: non-conformant bundle → `process.exitCode` non-zero; conformant bundle → zero; both render the report.
- [x] 8.4 Test that a bundle freshly produced by `runOkfPass` passes `verifyOkfConformance` with zero issues (guards against generate/verify check drift).

## 9. Verify

- [x] 9.1 Run the lint/typecheck/test suite; confirm `--okf` off output and `--okf` generate behavior/exit codes are unchanged, and that `--okf-check` exit codes match the report.
