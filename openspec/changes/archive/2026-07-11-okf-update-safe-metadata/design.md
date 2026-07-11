## Context

Phase 3 shipped `src/agent/okf.ts`: a deterministic stamp → validate → repair → root-`index.md` pass invoked from `runOpenWikiAgentCore` in `src/agent/index.ts`, only when `options.okf === true`, and only inside the branch that already detected a content change (`openWikiSnapshotBefore !== createOpenWikiContentSnapshot(cwd)`), around `writeLastUpdateMetadata`.

Two Phase-3 behaviors are the direct inputs to this change:

- **`resolveTimestamp` in `okf.ts`** returns the previous frontmatter `timestamp` whenever any non-empty value exists, else `now`. The Phase 3 design and spec explicitly scoped this to _same-run idempotence_ and deferred genuine cross-run edit detection ("would require persisting a body hash") to Phase 4.
- **`stampPage` builds a fresh field set** `{ type, title, description, timestamp }` (plus `resource` if it was already present), i.e. it drops every other prior frontmatter key on each re-stamp.

Supporting machinery already in place: `walkOpenWikiMarkdownFiles(cwd)` and `createOpenWikiContentSnapshot(cwd)` in `src/agent/utils.ts` share a single `visitOpenWikiDirectory` walk that skips `.last-update.json` (`UPDATE_METADATA_PATH`) by basename at the root; `okf.ts` already has `splitFrontmatter` (body vs. frontmatter), `writeIfChanged`/`atomicWriteFile`, `isReservedOkfFileName` (`index.md`/`log.md`), and `generateRootIndex`. `createRunContext`/`createGitSummary` already compute git evidence for the run.

## Goals / Non-Goals

**Goals:**

- Assign a page a **fresh `timestamp` only when its body genuinely changed** since the last stamp, and preserve the prior `timestamp` otherwise — across runs, not just within a single run.
- Keep the pass **byte-for-byte idempotent** on unchanged content, so the existing content-snapshot no-op optimization keeps working and scheduled runs don't produce noisy timestamp-only diffs.
- **Preserve producer-added / unknown frontmatter keys** across re-stamps, recomputing only the code-managed fields.
- Emit an OKF §7 `log.md` (date-grouped, newest-first) from information already available to the run, without making it a source of churn.
- Change nothing when `--okf` is off.

**Non-Goals:**

- A backfill pass that stamps existing pages when `--okf` is first enabled on an already-generated wiki that has no further content change (Phase 3's documented known limitation; the pass still only runs inside the content-change branch).
- Any change to the CLI flag, env key, or the model prompt contract. Because frontmatter is entirely code-owned and the model is already told never to emit or edit a `---` block, `timestamp` is fully code-managed and needs no new prompt rule; the existing "leave existing frontmatter untouched" rule already covers preservation.
- README/DEVELOPMENT docs, a CI conformance workflow, and example-workflow changes (Phase 5).
- A general-purpose frontmatter merge for arbitrary third-party Markdown; only OpenWiki-generated pages are handled.

## Decisions

### 1. Persist per-page body hash + timestamp in a dedicated, snapshot-excluded state file

Add `openwiki/.okf-state.json` (constant `OKF_STATE_PATH` in `src/constants.ts`), shaped `{ "version": 1, "pages": { "<relative/path.md>": { "bodyHash": "<sha256-hex>", "timestamp": "<ISO-8601>" } } }`. On each `--okf` run, for every non-reserved page:

- `bodyHash` = SHA-256 of the **body only** (the content returned by `splitFrontmatter`, i.e. excluding the `---` block), so the frontmatter the pass itself rewrites never feeds back into the hash.
- If the state has an entry for the page and its `bodyHash` equals the newly computed one → reuse the stored `timestamp` (body unchanged).
- Otherwise → the body changed (or the page is new); set `timestamp = now`.
- Rewrite `state.pages[path] = { bodyHash, timestamp }`, then prune entries for pages no longer present, and write the state file atomically via `writeIfChanged`.

**Why a separate file over reading the timestamp back out of the page's own frontmatter:** the page's stored `timestamp` alone can't tell you whether the body changed — you need the _previous_ body hash, which the frontmatter doesn't carry. **Why not fold it into `.last-update.json`:** that file is a single-snapshot `UpdateMetadata` owned by `utils.ts`; keeping OKF page-state separate avoids coupling and matches the module boundary. Alternative considered — deriving the "previous body" from git (`git show HEAD:...`): rejected because the wiki may be uncommitted or freshly generated, and it would make the pass depend on VCS state.

### 2. The state file is excluded from the shared walk, exactly like `.last-update.json`

`visitOpenWikiDirectory` currently skips `path.basename(UPDATE_METADATA_PATH)` at the root. Generalize that skip to a small set that also contains `path.basename(OKF_STATE_PATH)`, so the state file is invisible to both `createOpenWikiContentSnapshot` (can't perturb no-op detection) and `walkOpenWikiMarkdownFiles` (it's `.json`, already filtered there, but excluding it centrally keeps intent explicit). This is the single most important correctness point: a state file _inside_ the snapshot would risk churn feedback.

### 3. Timestamp resolution reads state, not frontmatter — with a migration fallback

Replace `resolveTimestamp(previousFields, now)` with a resolver that takes the page's prior state entry and current `bodyHash`. First-run migration (upgrading a Phase-3 wiki with stamped pages but no state file): when there is no state entry but the page's existing frontmatter carries a valid `timestamp`, seed state with that timestamp + current bodyHash and **preserve it** (don't bump), so enabling Phase 4 doesn't rewrite every page's timestamp at once. Only a page with neither a state entry nor a prior frontmatter timestamp gets `now`.

### 4. Preserve unknown keys by starting from the prior field map, then overwriting managed keys

`stampPage` builds the output field map by copying forward every key from the parsed prior frontmatter, then setting the code-managed keys (`type`, `title`, `description`, `timestamp`) to their freshly computed values. `resource` is thus preserved automatically (no longer a special case). Serialize with a **deterministic key order** — managed keys first in a fixed order, then remaining preserved keys sorted lexicographically — so re-stamping unchanged input yields byte-identical output (idempotence). This refines Phase 3 Decision 1 ("full overwrite of the block"): managed keys are still fully recomputed; only genuinely unknown producer keys are carried through, matching OKF §4.1 round-trip guidance.

### 5. `log.md` is generated by prepend, from the run command + git summary, with a shared format constant

On a content-changing `--okf` run, read the existing `openwiki/log.md` (if any), build a new entry for the run (ISO-8601 date, command `init`/`update`, and a one-line description drawn from the git change summary the run already computed), and write it grouped under the run's date, newest date first, newest entry first within a date. A shared `LOG_SEED`/format constant is the single source of truth for the header and entry shape (mirroring OpenKB's shared `INDEX_SEED`, report §7.4). `log.md` is already `isReservedOkfFileName` → exempt from stamping and from the `type` requirement; the pass writes it via `writeIfChanged` so an unchanged log is never rewritten. Because it's written _after_ the snapshot comparison and only on content-changing runs, it grows only when real changes happen and never triggers a no-op run on its own.

**Why prepend/accumulate rather than regenerate:** `.last-update.json` only stores the _last_ update, so the full history must be accumulated append-only in `log.md` itself. To keep this deterministic and idempotent, the per-run entry text must be a pure function of that run's inputs (no wall-clock beyond the run's own `now`, no ordering ambiguity).

### 6. The OKF pass gains the run command (and git change summary) as inputs

`runOkfPass(cwd)` becomes `runOkfPass(cwd, { command, changeSummary })` (or similar) so it can author `log.md` entries. `src/agent/index.ts` already has `command` and the run context/git summary at the call site; thread the minimal description through rather than re-deriving git state inside `okf.ts`.

### 7. Validation extends to `log.md`, stays report-only

Add a light structural check for `log.md` (present-and-parseable-as-the-expected shape; no frontmatter block, since it's a reserved non-index file) to the validation loop, reusing the existing issue-collection pattern. The pass still never throws; it returns the same `OkfConformanceReport`.

## Risks / Trade-offs

- **A state file that leaks into the content snapshot would create churn feedback** → Mitigated by Decision 2 (exclude it from `visitOpenWikiDirectory`, the single shared walk) and a test asserting `createOpenWikiContentSnapshot` is unchanged by the state file's presence.
- **Body-hash computed over the wrong slice (including frontmatter) would make every run look changed** → Mitigated by hashing strictly the `splitFrontmatter` body, plus a test: stamp, re-run with no body edit, assert timestamp and file bytes are unchanged.
- **First Phase-4 run mass-bumping timestamps on upgrade** → Mitigated by Decision 3's migration fallback (seed from existing frontmatter timestamp).
- **Non-deterministic key ordering when preserving unknown keys would break idempotence** → Mitigated by the fixed managed-key order + sorted remainder (Decision 4).
- **`log.md` growing unboundedly / re-ordering on each run** → Accepted: OKF §7 logs are append-only history; entries are deterministic and only added on real changes, and `writeIfChanged` avoids no-op rewrites. Trimming/rotation is out of scope.
- **State file and stamped pages are written after the snapshot gate, so they only take effect on the next run** → This is the existing Phase 3 integration behavior (unchanged); the next run sees them as `snapshotBefore` and, absent model edits, is a clean no-op.

## Migration Plan

- Purely additive and backward-compatible. Existing Phase-3 `--okf` wikis upgrade on their next content-changing run: the state file is created and seeded from current frontmatter timestamps (no mass timestamp bump), and `log.md` begins accumulating from that run forward (no attempt to backfill historical entries). `.okf-state.json` and `log.md` are committed like any other `openwiki/` file.
- Rollback is reverting `okf.ts`/`utils.ts`/`index.ts`/`constants.ts` changes and deleting `openwiki/.okf-state.json` and `openwiki/log.md`; no other persisted-state format changes. With `--okf` off, none of this executes.

## Open Questions

- Should `log.md` entry descriptions include per-file detail (which pages changed) or stay a one-line command+summary? This design uses a concise one-line description; richer detail can be added later without a format break since OKF §7 only mandates date-grouped, newest-first entries.
- Should the state file schema carry a `version` for future migrations? This design includes `version: 1` so a later change can evolve the shape safely.
