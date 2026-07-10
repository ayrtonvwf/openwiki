## Context

Phases 1–4 of the OKF work (`specs/openwiki-okf-implementation-report.md`) are implemented and tested. The generate path is solid: `runOkfPass(cwd, runInfo)` in `src/agent/okf.ts` stamps frontmatter, regenerates the root `index.md`, appends `log.md`, and returns an `OkfConformanceReport { conformant, issues }`; it is invoked from `runOpenWikiAgentCore` (`src/agent/index.ts`) only when a content change is detected and `options.okf` is true, and the result reaches `OpenWikiRunResult.okfConformant`.

What is missing is everything in report §6 "Phase 5 — Docs, tests, polish", plus the CI gate anticipated in §4.5:

- `--okf` is documented nowhere (`README.md`, `DEVELOPMENT.md`: 0 hits).
- Neither example workflow (`examples/openwiki-update.yml`, `examples/openwiki-update.gitlab-ci.yml`) mentions OKF.
- `runOkfPass` always re-stamps and repairs, so there is no way to _verify_ a bundle without mutating it, and `okfConformant` never affects the process exit code — CI cannot gate on conformance.
- There is no standalone conformance fixture bundle; coverage lives only in `okf.test.ts` / `agent-okf-integration.test.ts`.

Relevant existing surface this design reuses: `walkOpenWikiMarkdownFiles(cwd)` (traversal that already excludes the state file), `isReservedOkfFileName`, `isRootIndex`, `isLogFile`, `findMissingOkfFields`, `findInvalidFrontmatter`, `checkIndexStructure`, `checkLogStructure`, and the `OkfConformanceReport` type — all already exported from `okf.ts`.

## Goals / Non-Goals

**Goals**

- A repair-disabled verification entry point that produces an `OkfConformanceReport` for an on-disk bundle without stamping, generating, or writing anything.
- A CLI path that runs that verification and exits non-zero when the bundle is non-conformant (zero when conformant), suitable for CI.
- README + DEVELOPMENT documentation of the flag, env key, taxonomy, reserved files, and conformance guarantees.
- `--okf` usage (and an optional conformance-check step) shown in both example workflows.
- A checked-in conformance fixture bundle (one conformant, plus known-bad variants) driving the verifier's tests.

**Non-Goals**

- The first-run backfill gap (report observation #6): enabling `--okf` on an already-current wiki still stamps nothing until an unrelated content change. Left as the documented known limitation.
- Stamping `resource` / `tags` (observation #7). These are OKF §9-optional and out of Phase 5's docs/tests/CI scope.
- Any change to the default `--okf` generate-and-repair behavior or its exit code.

## Decisions

### Decision 1: A read-only `verifyOkfConformance(cwd)` function alongside `runOkfPass`

Add a new exported function in `src/agent/okf.ts` that walks the bundle with the same `walkOpenWikiMarkdownFiles(cwd)` and applies the existing check helpers, but never calls `stampPage` or `writeIfChanged`:

- For each non-reserved page: run `findMissingOkfFields` and `findInvalidFrontmatter`; a missing/empty `type` or unparseable block is an `error` issue.
- For each `index.md` / `log.md`: run `checkIndexStructure` / `checkLogStructure`.
- Return the same `OkfConformanceReport { conformant, issues }` shape so callers and output formatting are shared with the generate pass.

**Why not add a `repair: false` flag to `runOkfPass`?** `runOkfPass` interleaves stamping, state read/write, `index.md`/`log.md` generation, and validation over the _post-stamp_ content; threading a "don't write, and validate pre-stamp content" mode through it would fork most of its body and risk the generate path. A separate read-only function reuses the leaf check helpers (the actual conformance logic) while keeping the two entry points independently testable. The checks stay single-source-of-truth; only the orchestration differs.

### Decision 2: Expose verification as an `--okf-check` run mode that does not invoke the agent

Add `--okf-check` parsing in `src/commands.ts` (mirroring the existing `--okf` / `--no-okf` handling and adding a help row + example). When set, `src/cli.tsx` resolves the OpenWiki directory, calls `verifyOkfConformance(cwd)`, renders the report (per-file issues + overall pass/fail) via the existing status/output components, and sets `process.exitCode` to `1` on a non-conformant result and `0` otherwise. It does **not** start the documentation agent — verification inspects what is already on disk, which is exactly what a CI gate wants (fast, no model call, no mutation).

**Why a dedicated mode over `--okf --strict` on a generate run?** A generate run's job is to produce/repair; making it also fail hard couples "did we write good output" to "was the pre-existing tree conformant" and still mutates files. A standalone check is the clean CI primitive and matches §4.5's "repair is disabled" framing. `--okf` (generate) keeps returning `okfConformant` in `OpenWikiRunResult` unchanged.

Alternative considered and rejected: a separate top-level subcommand (e.g. `openwiki okf-check`). The CLI is flag-oriented (`--init` / `--update` / `--print`), so a flag is the consistent shape; this keeps `parseCommand`'s `CliCommand` union coherent.

### Decision 3: Documentation content

- **README.md** — a concise "OKF output" section: what OKF is (one line + link), how to enable it (`--okf` / `--no-okf`, `OPENWIKI_OKF` env key, precedence flag > env > default-off), the reserved files it produces (`index.md`, `log.md`), the type taxonomy table (from `REPO_DOC_TYPES`), the conformance guarantee (code owns frontmatter), and `--okf-check` for CI.
- **DEVELOPMENT.md** — the contributor view: the code-owned-frontmatter design (model writes body only), `src/agent/okf.ts` responsibilities, `.okf-state.json` machine state and why it is excluded from the snapshot, and how to run `--okf-check` and the OKF tests locally.

### Decision 4: Fixture bundle layout

Add a checked-in fixture tree under the test area (e.g. `src/agent/__fixtures__/okf/`) with: a `conformant/` bundle (valid frontmatter + `type` on every page, well-formed `index.md`/`log.md`) and `nonconformant/` variants (a page missing frontmatter; a page with a present-but-empty `type`; a page with an unparseable block). Tests point `verifyOkfConformance` at each and assert the report + derived exit code. This gives a stable, human-inspectable asset separate from the programmatically-constructed cases already in `okf.test.ts`.

## Risks / Trade-offs

- **Check-logic drift between generate and verify paths** → Both paths call the _same_ leaf helpers (`findMissingOkfFields`, `findInvalidFrontmatter`, `checkIndexStructure`, `checkLogStructure`); only orchestration differs. A test asserts a freshly generated bundle passes `verifyOkfConformance` with zero issues, catching divergence.
- **`--okf-check` on a wiki never generated with `--okf`** (no frontmatter anywhere) reports a large failure and exits non-zero → This is correct behavior (the bundle is genuinely non-conformant), and the docs state `--okf-check` is for bundles produced with `--okf`. Not masked.
- **Example-workflow changes touch CI** → The `examples/*` files are illustrative templates, not this repo's active workflows, and the task explicitly avoids editing `.github/workflows/`. `--okf` usage is added as commented/opt-in lines so copying the example unchanged does not silently alter behavior.
- **Exit-code contract** → Verification uses the existing "an `error`-severity issue means non-conformant" rule (`report.conformant`); warnings (e.g. fallback `type`) do not fail the gate, matching the generate pass's `conformant` computation.

## Migration Plan

Purely additive. `--okf-check` and the new docs/examples/fixtures introduce no change to existing behavior: `--okf` off is byte-for-byte unchanged, and `--okf` generate runs keep their current semantics and exit codes. No data migration; `.okf-state.json` format is untouched. Rollback is removing the flag handling and docs.

## Open Questions

- **Flag name**: `--okf-check` vs. `--check-okf` vs. `--okf --check`. Proposed `--okf-check` for tab-friendly grouping with `--okf`; open to the maintainer's preference.
- **Should `--okf-check` imply resolving `OPENWIKI_OKF`?** Proposed: no — the check is meaningful regardless of whether generation is currently enabled, so it runs whenever the flag is passed.
