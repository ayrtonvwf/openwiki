## Why

Phases 1–4 delivered a working, spec-conformant `--okf` mode: the tool owns the frontmatter block, generates the root `index.md` with `okf_version: "0.1"`, preserves timestamps across updates, and emits `log.md`. But the feature is effectively undiscoverable and unenforceable. `--okf` is documented nowhere (`grep -i okf README.md DEVELOPMENT.md` → 0 hits), neither example workflow shows how to enable it, and conformance is only surfaced as event text — `okfConformant` never reaches the process exit code, so a scheduled/CI run cannot gate on it. This is exactly the "Phase 5 — Docs, tests, polish" work called out in `specs/openwiki-okf-implementation-report.md` §6, and the CI-gate item anticipated in §4.5. Closing it makes OKF conformance a discoverable, documented, and machine-verifiable property rather than an internal implementation detail.

## What Changes

- **Repair-disabled conformance verification**: add a way to run the OKF conformance checks over an existing bundle _without_ regenerating or mutating any file (the current pass always re-stamps, which is itself the repair). This is the "repair is disabled" mode §4.5 anticipates.
- **Non-zero exit for CI gating**: when OKF verification runs in strict/check mode and the bundle is non-conformant, the process SHALL exit non-zero, so a scheduled GitHub Action or GitLab pipeline can fail on drift. Conformance status is also surfaced in human-readable run output.
- **README documentation**: document the `--okf` flag, the `OPENWIKI_OKF` env key, the type taxonomy, the reserved files (`index.md` / `log.md`), and the conformance guarantees (spec §5).
- **DEVELOPMENT documentation**: document the OKF architecture for contributors — the code-owned-frontmatter design, `src/agent/okf.ts` responsibilities, the `.okf-state.json` machine state, and how to run the conformance check locally (spec §5).
- **Example workflow usage**: show `--okf` (and the CI conformance check) in `examples/openwiki-update.yml` and `examples/openwiki-update.gitlab-ci.yml` (spec §5).
- **Conformance fixture bundle**: add a standalone, checked-in OKF fixture bundle (a minimal conformant wiki plus known-bad variants) used as a stable asset for the verifier's tests, complementing the existing unit/integration tests (spec §5).

Non-goals (explicitly out of scope for Phase 5, tracked separately): the first-run backfill gap (enabling `--okf` on an already-current wiki stamps nothing until an unrelated edit — review observation #6), and stamping the recommended-but-optional `resource`/`tags` fields (observation #7). Both are OKF §9-optional and are design decisions, not Phase 5 docs/tests/CI work.

## Capabilities

### New Capabilities

- (none — this change extends the existing `okf-conformance` capability rather than introducing a new one)

### Modified Capabilities

- `okf-conformance`: add requirements for (1) a **repair-disabled conformance verification mode** that inspects an existing bundle and reports issues without mutating any file, and (2) a **non-zero process exit** when that verification runs in strict/CI mode and finds the bundle non-conformant, so conformance can gate CI. No change to the default `--okf` generate-and-repair behavior.

## Impact

- **Modified**: `src/commands.ts` (parse the new conformance-check flag; help rows + example); `src/cli.tsx` (resolve the flag, run verification, set `process.exitCode` on non-conformance, surface status in output); `src/agent/okf.ts` (a repair-disabled verify entry point that validates without stamping/writing) and/or `src/agent/index.ts` (thread the strict/check option into the OKF pass).
- **Docs**: `README.md` and `DEVELOPMENT.md` gain OKF sections (flag, env key, taxonomy, reserved files, conformance guarantees, local check command).
- **Examples**: `examples/openwiki-update.yml` and `examples/openwiki-update.gitlab-ci.yml` gain commented `--okf` usage and an optional conformance-check step.
- **New fixture asset**: a checked-in OKF conformance fixture bundle under the test tree (one conformant bundle + known-bad variants).
- **Tests**: verify strict/check mode reports conformance without mutating files; a non-conformant bundle produces a non-zero exit while a conformant one exits 0; the fixture bundle round-trips through the verifier as expected.
- **No effect on `--okf` off**: when the flag is disabled, none of this runs and output stays byte-for-byte identical to today. Default `--okf` generate runs also keep their current generate-and-repair semantics; the non-zero exit only applies to the new strict/check path.
