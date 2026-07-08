## Why

Phase 3 made a single `--okf` run spec-conformant by having code own the frontmatter block, but it stamps a page's `timestamp` once and then preserves it forever — an edited page keeps a stale `timestamp`, and it only guarantees same-run idempotence (the existing spec explicitly defers genuine cross-run edit detection to Phase 4). It also silently drops any producer-added frontmatter keys on every re-stamp, and emits no OKF `log.md`. This change makes `--okf` output safe across incremental/scheduled updates: timestamps track real body edits, producer-added metadata survives, and change history is available in-format — without breaking OpenWiki's content-snapshot no-op optimization.

## What Changes

- Make `timestamp` **body-hash-aware across runs**: persist a per-page body-content hash + stamped `timestamp` in a machine-state file, then on each `--okf` run assign a fresh `timestamp` only to pages whose body actually changed since the last stamp, and preserve the prior `timestamp` for unchanged bodies. This replaces Phase 3's "preserve any existing timestamp forever" rule while keeping same-run reruns byte-for-byte idempotent.
- Add a dedicated OKF machine-state file (e.g. `openwiki/.okf-state.json`) holding `{ path -> { bodyHash, timestamp } }`, **excluded from both the content snapshot walk and the OKF markdown walk** (mirroring `.last-update.json`) so it can never itself trigger or break no-op detection.
- **Preserve producer-added / unknown frontmatter keys** across re-stamps: recompute only the code-managed fields (`type`, `title`, `description`, `timestamp`), while carrying forward any other keys a prior run or producer added (per OKF §4.1 round-trip guidance), with a deterministic key ordering so output stays idempotent.
- Add **deterministic `log.md` generation**: on each content-changing `--okf` run, prepend a dated entry to the bundle-root `openwiki/log.md` — an OKF §7 reserved file: a flat, ISO-8601 date-grouped, newest-first change list — derived from the run command and git summary already available. `.last-update.json` remains the machine state; `log.md` is the human-readable, in-format history.
- Extend validation to cover the new `log.md` reserved-file structure and confirm the state file is excluded, keeping the Phase 3 stamp → validate → repair → `index.md` pass otherwise intact.
- Migration-safe first run: when no state file exists yet (upgrading a Phase 3 wiki), seed state from each page's existing frontmatter `timestamp` instead of bumping every page's timestamp.

## Capabilities

### New Capabilities

- (none — this change extends the existing `okf-conformance` capability rather than introducing a new one)

### Modified Capabilities

- `okf-conformance`: the `timestamp`-preservation requirement changes from "preserve any existing value / same-run idempotence only" to "body-hash-aware across runs" (persisted state, fresh timestamp on genuine body edit); new requirements are added for producer-added-key preservation, the excluded machine-state file, and `log.md` generation + structural validation.

## Impact

- **Modified**: `src/agent/okf.ts` (body-hash timestamp resolution, producer-key-preserving stamp, `log.md` generation, state-file read/write, extended validation); `src/agent/utils.ts` (exclude the OKF state file from the shared walk / snapshot, alongside `.last-update.json`); `src/agent/index.ts` (thread the run command / git-change info into the OKF pass so `log.md` entries can describe the change); `src/constants.ts` (add the OKF state-file path constant and a `log.md` seed/format constant).
- **New persisted file**: `openwiki/.okf-state.json` (machine state, git-tracked, excluded from snapshot + OKF walk).
- **New generated file**: `openwiki/log.md` (OKF §7 reserved change log, only present/updated under `--okf`).
- **Tests**: producer-added keys survive an incremental re-stamp; an unchanged-body page keeps its prior `timestamp` while an edited-body page gets a fresh one; a no-op `--okf` update writes nothing (parity with non-OKF no-op); `log.md` matches the OKF §7 date-grouped, newest-first format; the state file is excluded from the content snapshot.
- **No effect on `--okf` off**: when the flag is disabled, none of this runs and output stays byte-for-byte identical to today.
- **Explicitly out of scope** (later phases): a backfill pass that stamps existing pages when `--okf` is enabled on an already-generated wiki with no further content change (Phase 3's documented known limitation, unchanged here); README/DEVELOPMENT docs, CI conformance check, and example workflow updates (Phase 5).
