## 1. Define the taxonomy abstraction in constants.ts

- [x] 1.1 Add a `DocTypeTaxonomy` type (`{ types: Readonly<Record<string, string>>; fallback: string }`) and keep the existing `assertSanitizedRepoDocTypes` validation, generalized/renamed to validate any taxonomy's `types` at construction.
- [x] 1.2 Rename `REPO_DOC_TYPES` → `CODE_DOC_TYPES` and fold `REPO_DOC_TYPE_FALLBACK` into a `CODE_DOC_TYPES` taxonomy with `fallback: "Reference"`, preserving today's exact type→directory entries.
- [x] 1.3 Add a minimal `PERSONAL_DOC_TYPES` taxonomy: `""` → `Overview`, `sources` → `Source`, `topics` → `Topic`, with `fallback: "Note"` (confirm labels against the canonical personal surfaces; all must pass the sanitization patterns).
- [x] 1.4 Replace `getRepoDocTypeForDirectory(dir)` with a pure `getDocTypeForDirectory(taxonomy, dir): { type: string; isFallback: boolean }` that inverts `taxonomy.types` and falls back to `taxonomy.fallback`.
- [x] 1.5 Add `getTaxonomyForMode(mode)` returning `CODE_DOC_TYPES` / `PERSONAL_DOC_TYPES` (default input: `OpenWikiOutputMode`, `repository` → code, `local-wiki` → personal; per design decision 3).

## 2. Thread the taxonomy through the prompt seam

- [x] 2.1 Change `createOkfContractSection()` to accept a `DocTypeTaxonomy` and render its `types` in the directory contract instead of the hard-coded `REPO_DOC_TYPES`.
- [x] 2.2 In `createSystemPrompt`, resolve the taxonomy from `options.outputMode` via `getTaxonomyForMode` and pass it to `createOkfContractSection()`.

## 3. Thread the taxonomy through the stamping seam

- [x] 3.1 Change `stampPage()` to accept a `DocTypeTaxonomy` (defaulting to `CODE_DOC_TYPES` to preserve existing call shapes) and call `getDocTypeForDirectory(taxonomy, ...)` instead of `getRepoDocTypeForDirectory`.
- [x] 3.2 Add a taxonomy parameter to `runOkfPass` and pass it into every `stampPage` call. `verifyOkfConformance` was left unchanged: it never calls `stampPage` or otherwise reads the taxonomy (it only checks that `type` is present and non-empty), and the proposal's own non-goals state `--okf-check` behavior stays untouched — so threading an unused taxonomy parameter through it would be dead code.
- [x] 3.3 Update the caller at `src/agent/index.ts:243` to pass the mode-derived taxonomy into `runOkfPass`, using the `outputMode` already in scope.
- [x] 3.4 No change needed at `src/cli.tsx:918`: `verifyOkfConformance` takes no taxonomy parameter (see 3.2), so there is nothing mode-derived to pass at this call site.

## 4. Update and extend tests

- [x] 4.1 Update `test/constants.test.ts` for the renamed constant and add coverage for `getDocTypeForDirectory` (recognized dir, unrecognized dir → fallback) and `getTaxonomyForMode` for both modes.
- [x] 4.2 Update `test/prompt.test.ts` so the OKF-contract assertions use the mode-selected taxonomy; add a case asserting a personal-mode prompt lists `PERSONAL_DOC_TYPES` entries and not code-only types.
- [x] 4.3 Add/extend an OKF-pass test asserting a personal-mode `sources/` page stamps a personal `type` (e.g. `Source`) while a code-mode `operations/` page still stamps `Operations`.

## 5. Verify

- [x] 5.1 Run the type checker / build to confirm all renamed references and new signatures compile.
- [x] 5.2 Run the test suite (`test/constants.test.ts`, `test/prompt.test.ts`, OKF pass tests) and confirm green.
- [x] 5.3 Confirm no changes leaked into the OKF carrier (frontmatter shape, `index.md`, `log.md`, `--okf`, `--okf-check`) and that `code`-mode stamped types are unchanged.
