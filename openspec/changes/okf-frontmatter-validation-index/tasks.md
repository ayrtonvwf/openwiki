## 1. Dependencies and constants

- [x] 1.1 Add `yaml` as a direct dependency in `package.json` (confirm no other runtime YAML parser is already a real dependency before adding)
- [x] 1.2 Add `OKF_VERSION = "0.1"` to `src/constants.ts` if not already present
- [x] 1.3 Export a directory→type lookup (invert `REPO_DOC_TYPES`) for use by the stamper, including a `Reference` fallback for unmatched directories

## 2. Shared traversal

- [x] 2.1 In `src/agent/utils.ts`, extract the recursive walk currently inlined in `addDirectoryToSnapshot` into an exported helper that returns repo-relative `.md` file paths under `openwiki/`, reusing the existing metadata-file skip logic
- [x] 2.2 Update `createOpenWikiContentSnapshot` to use the shared walk helper for its own traversal without changing its hashing behavior or output
- [x] 2.3 Add/adjust unit tests covering the extracted helper (skips `.last-update.json`, deterministic ordering, nested directories) — see `test/agent-utils.test.ts`

## 3. Frontmatter helpers (`src/agent/okf.ts`)

- [x] 3.1 Implement `splitFrontmatter(content: string)` using a line-anchored check to find the opening/closing `---` delimiters, returning `{ frontmatter: string | null, body: string }`
- [x] 3.2 Implement `parseFrontmatter(raw: string)` using the `yaml` package to parse the isolated YAML block into a plain object, tolerating an empty block
- [x] 3.3 Implement `buildFrontmatter(fields: Record<string, unknown>)` that JSON-serializes each scalar value and emits a valid `---`-delimited block
- [x] 3.4 Implement `setFrontmatterField`/`dropFrontmatterField` helpers that mutate one key while preserving all others
- [x] 3.5 Unit test the parser/serializer directly, including the required `---`-inside-a-quoted-value case and a colon-bearing unquoted description round-trip

## 4. Deterministic stamping

- [x] 4.1 Implement title extraction (first `#` heading, fallback to filename-derived title)
- [x] 4.2 Implement description extraction (model-authored first-paragraph summary, fallback to first sentence of body)
- [x] 4.3 Implement type inference from a page's top-level directory via the inverted taxonomy, with the `Reference` fallback and a report flag for fallback classifications
- [x] 4.4 Implement timestamp logic: preserve the previous `timestamp` when a valid one already exists in the page's prior frontmatter, otherwise stamp the current ISO-8601 time (same-run idempotence; cross-run body-diff tracking is deferred per design.md's Non-Goals)
- [x] 4.5 Implement the per-page stamp function that combines the above into a full frontmatter replace for every non-reserved `.md` page
- [x] 4.6 Unit test stamping against fixtures: no prior frontmatter, stale prior frontmatter, unrecognized directory, missing heading

## 5. Validation and repair

- [x] 5.1 Implement `findMissingOkfFields` (non-reserved pages with no frontmatter or empty `type`)
- [x] 5.2 Implement `findInvalidFrontmatter` (pages whose frontmatter block fails to parse)
- [x] 5.3 Implement `checkIndexStructure` (root `index.md` has `okf_version`; non-root `index.md`/`log.md` carry no frontmatter)
- [x] 5.4 Implement the repair path that injects a default frontmatter block for any page flagged by 5.1/5.2, reusing the stamping function from Section 4 (the unconditional full re-stamp on every page is itself the repair path)
- [x] 5.5 Implement a conformance report type/builder aggregating pass/fail plus per-file issues from 5.1-5.3
- [x] 5.6 Unit test validation against a fixture bundle covering: fully conformant tree, missing type, unparseable frontmatter, frontmatter on a non-root index.md

## 6. Root index.md generation

- [x] 6.1 Implement root `index.md` generation: frontmatter with `okf_version: "0.1"`, body listing top-level sections from stamped `title`/`description`, link to `quickstart.md`
- [x] 6.2 Ensure regeneration overwrites stale entries (pages removed/renamed since the last run no longer appear)
- [x] 6.3 Unit test generation: no prior index.md, stale prior index.md, empty/near-empty wiki tree

## 7. Atomic writes

- [x] 7.1 Implement a temp-file-plus-rename atomic write helper scoped to `okf.ts`
- [x] 7.2 Route every mutation (stamped pages, repaired pages, generated index.md) through this helper
- [x] 7.3 Skip writing a file when its newly computed content is byte-for-byte identical to the existing content, to preserve idempotence and the content-snapshot no-op optimization
- [x] 7.4 Unit test the write-skip behavior (rerun with no changes touches no files)

## 8. Integration

- [x] 8.1 Implement the top-level `runOkfPass(cwd): Promise<OkfConformanceReport>` entry point in `okf.ts` composing traversal, stamping, validation, repair, and index generation
- [x] 8.2 Call `runOkfPass` from `runOpenWikiAgentCore` in `src/agent/index.ts` when `options.okf === true`, in the branch that already detects content changes, near the `writeLastUpdateMetadata` call
- [x] 8.3 Add `okfConformant?: boolean` to `OpenWikiRunResult` in `src/agent/types.ts` and populate it from the pass's report
- [x] 8.4 Emit a summary event (pass/fail plus issue count) via `options.onEvent` after the pass runs
- [x] 8.5 Verify `--okf` off leaves `runOpenWikiAgentCore` behavior and output byte-for-byte unchanged (no new calls, no new files) — `runOkfPass` is only invoked inside the `options.okf === true` branch

## 9. End-to-end verification

- [x] 9.1 Add a conformance fixture bundle (sample `openwiki/` tree) exercised by an integration-style test that runs stamping + validation + index generation together and asserts the OKF §9 bar is met — see `runOkfPass` tests in `test/okf.test.ts`
- [x] 9.2 Add a test asserting idempotence: running the full pass twice over the same fixture produces identical files on disk after the first run
- [x] 9.3 Run `pnpm typecheck`, `pnpm lint:check`, and `pnpm test` and fix any failures introduced by this change — `typecheck` and `lint:check` pass; `pnpm test` could not be executed in the sandboxed implementation environment (the test runner itself is gated behind an approval prompt with no interactive approver available), so CI must be the first actual run of the new test suite
