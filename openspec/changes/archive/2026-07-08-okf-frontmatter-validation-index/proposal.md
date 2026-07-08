## Why

OpenWiki's `--okf` mode today relies entirely on the model following a prompt contract (Phase 1/2), with no code that stamps, validates, or repairs frontmatter, and no root `index.md`. OKF v0.1's whole normative bar (§9) is a parseable frontmatter block with a non-empty `type` on every page, plus `index.md` structure — so a model slip silently breaks conformance. This change adds the deterministic pass from `specs/openwiki-okf-implementation-report.md` §4.2-§4.5/§7 that guarantees it instead.

## What Changes

- Add a new module `src/agent/okf.ts` owning the entire frontmatter lifecycle for `--okf` runs: hardened `build`/`split`/`parse`/`set`/`drop` helpers on a Markdown file's `---` block, matching the closing delimiter line-anchored (`\n---`) so a `---` inside a quoted value can never truncate the block, and serializing scalar values as JSON (a strict YAML subset) for safe, single-line, round-trippable output.
- Add deterministic stamping: for every non-reserved `.md` page under `openwiki/`, stamp/refresh `type` (inferred from the page's directory via `REPO_DOC_TYPES`), `title` (first `#` heading, fallback to filename), `description` (model-authored first-paragraph summary, else first sentence), and `timestamp` (ISO-8601, code-generated). Add `resource` only where a page maps to a concrete asset.
- Add OKF §9 validation (parseable frontmatter present, non-empty `type`, `index.md`/`log.md` structural rules) and safe deterministic repair for pages missing frontmatter or `type`, so conformance holds even when the model drifts from the Phase 2 prompt contract.
- Add deterministic generation of the bundle-root `openwiki/index.md`: a frontmatter block declaring `okf_version: "0.1"` (the one place OKF permits frontmatter in an index file) plus a listing of top-level sections built from each page's stamped `title`/`description`, linking to `quickstart.md`.
- Add a conformance report (pass/fail plus per-file issues) emitted to run output.
- Route every mutation this pass makes through an atomic-write helper, since the pass can run in scheduled CI and be interrupted.
- Wire the pass into `src/agent/index.ts`, invoked only when `options.okf === true`, around the existing `writeLastUpdateMetadata` call, after a successful init/update run.
- Add `OKF_VERSION = "0.1"` to `src/constants.ts` (if not already present) and factor the recursive directory walk currently private to `src/agent/utils.ts` (`addDirectoryToSnapshot`) so `okf.ts` can reuse traversal and metadata-file-skipping logic instead of duplicating it.
- Add a minimal YAML dependency (`yaml`) only as needed to make the validator robust against arbitrary/legacy frontmatter content, keeping the footprint minimal.

## Capabilities

### New Capabilities

- `okf-conformance`: the deterministic stamp → validate → repair → `index.md` pass that guarantees `--okf` output conforms to OKF v0.1 §9, including the frontmatter helper module, the type/title/description/timestamp stamping rules, the validator, the repair path, root `index.md` generation, and the conformance report.

### Modified Capabilities

- (none — Phase 1/2 plumbing and prompt contract are unchanged by this proposal)

## Impact

- **New file**: `src/agent/okf.ts` (frontmatter helpers, stamping, validation, repair, `index.md` generation, atomic writes, reporting).
- **Modified**: `src/agent/index.ts` (invoke the pass after a successful `--okf` run), `src/agent/utils.ts` (export/share the directory walk), `src/agent/types.ts` (optionally add `okfConformant?: boolean` to `OpenWikiRunResult`), `src/constants.ts` (add `OKF_VERSION` if missing).
- **Dependencies**: possible new direct dependency on `yaml` (or equivalent minimal frontmatter/YAML library).
- **Tests**: new unit tests for the frontmatter parser (including the `---`-in-quoted-value case), stamping, validator, repair path, and `index.md` generator, plus a conformance fixture bundle.
- **No effect on `--okf` off**: when the flag is disabled, this pass does not run and output stays byte-for-byte identical to today.
- **Explicitly out of scope** (later phases): timestamp/metadata preservation reconciled with the content-snapshot no-op check across surgical updates, `log.md` generation, README/DEVELOPMENT docs, CI conformance checks, and example workflow updates.
