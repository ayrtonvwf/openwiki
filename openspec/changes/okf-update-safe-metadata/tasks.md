## 1. Constants and machine-state file

- [ ] 1.1 Add `OKF_STATE_PATH` (`${OPEN_WIKI_DIR}/.okf-state.json`) to `src/constants.ts`, next to `UPDATE_METADATA_PATH`.
- [ ] 1.2 Add a shared `log.md` seed/format constant (header + entry shape) to `src/constants.ts` as the single source of truth for the change-log format.

## 2. Exclude the state file from traversal and snapshot

- [ ] 2.1 Generalize the root-level skip in `visitOpenWikiDirectory` (`src/agent/utils.ts`) so it skips both `path.basename(UPDATE_METADATA_PATH)` and `path.basename(OKF_STATE_PATH)`.
- [ ] 2.2 Confirm (via test) that `createOpenWikiContentSnapshot` and `walkOpenWikiMarkdownFiles` both ignore the state file, so it cannot perturb no-op detection.

## 3. OKF state read/write in okf.ts

- [ ] 3.1 Define the state schema type (`{ version: 1, pages: Record<string, { bodyHash, timestamp }> }`) and add read (tolerant of missing/malformed → empty state) and atomic write helpers in `src/agent/okf.ts`, reusing `writeIfChanged`.
- [ ] 3.2 Add a body-hash helper: SHA-256 over the `splitFrontmatter` body only (never the frontmatter block).

## 4. Body-hash-aware timestamp resolution

- [ ] 4.1 Replace `resolveTimestamp(previousFields, now)` with a resolver keyed on the page's prior state entry and current body hash: preserve prior `timestamp` when body hash matches; assign `now` when the body changed or the page is new.
- [ ] 4.2 Implement the migration fallback: when there is no state entry but the page's existing frontmatter has a valid `timestamp`, preserve it and seed state from it (no mass bump on first Phase-4 run).
- [ ] 4.3 Thread the prior-state entry and computed body hash through `stampPage` and record the updated `{ bodyHash, timestamp }` back into the in-memory state.

## 5. Preserve producer-added frontmatter keys

- [ ] 5.1 Change `stampPage` to build output fields by copying forward all prior frontmatter keys, then overwriting the managed keys (`type`, `title`, `description`, `timestamp`); drop the `resource`-only special case (now covered by the copy-forward).
- [ ] 5.2 Make `buildFrontmatter` (or its caller) emit a deterministic key order: managed keys first in fixed order, then remaining preserved keys sorted lexicographically, so unchanged input round-trips byte-for-byte.

## 6. log.md generation

- [ ] 6.1 Add `runOkfPass` inputs for the run command and a one-line change/git summary (update the call site in `src/agent/index.ts` to pass them; source the summary from the run context/git summary already computed).
- [ ] 6.2 Implement `log.md` generation in `okf.ts`: read existing `openwiki/log.md`, prepend a new ISO-8601 date-grouped entry (newest date first, newest entry first within a date) using the shared format constant, write via `writeIfChanged`; no frontmatter block.
- [ ] 6.3 Only append on a content-changing run (the pass already runs only inside that branch); ensure an unchanged log is never rewritten.

## 7. Prune state and finalize the pass

- [ ] 7.1 After stamping all pages, prune state entries for pages no longer present and write the state file (atomic, `writeIfChanged`).
- [ ] 7.2 Keep the pass report-only (never throw); return the existing `OkfConformanceReport`.

## 8. Validation extensions

- [ ] 8.1 Add a light structural check for `log.md` (reserved, no frontmatter block) to the validation loop, collecting issues via the existing pattern.
- [ ] 8.2 Confirm the state file is never surfaced by validation (it is not a `.md` page).

## 9. Tests

- [ ] 9.1 Unit-test body-hash-aware timestamp: unchanged body preserves `timestamp`; edited body gets a fresh one; unrelated pages keep theirs.
- [ ] 9.2 Test the migration fallback: first run with no state file preserves existing frontmatter timestamps and seeds state.
- [ ] 9.3 Test producer-added key preservation across a re-stamp, and deterministic key ordering (byte-for-byte idempotent re-stamp).
- [ ] 9.4 Test that a no-op `--okf` update writes nothing and that the state file is excluded from the content snapshot.
- [ ] 9.5 Test `log.md`: a content-changing run prepends a valid OKF §7 date-grouped, newest-first entry with no frontmatter; a no-op run does not rewrite it; `log.md` is exempt from the `type` validation.

## 10. Verify

- [ ] 10.1 Run the existing lint/typecheck/test suite and confirm `--okf` off output is byte-for-byte unchanged.
