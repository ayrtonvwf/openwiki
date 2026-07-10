## Why

Post-merge, OpenWiki has a `code` / `personal` mode axis (`OpenWikiRunMode`, mapped to `OpenWikiOutputMode` `repository` / `local-wiki`), but the OKF `type` taxonomy is a single hard-coded code-documentation table (`REPO_DOC_TYPES`). Personal-mode wikis get stamped and prompted with code-specific types (`Architecture`, `API Reference`, `Data Model`, …) that do not describe a personal knowledge base, so nearly every personal page falls back to `Reference` and the prompt's directory contract is misleading. The OKF carrier is otherwise mode-agnostic; only the taxonomy needs to vary.

## What Changes

- Introduce a `DocTypeTaxonomy` value (a validated, frozen type→directory map plus its fallback) and a pure `getDocTypeForDirectory(taxonomy, directory)` lookup, replacing the module-global `getRepoDocTypeForDirectory`.
- Rename the current constant `REPO_DOC_TYPES` → `CODE_DOC_TYPES` (and `REPO_DOC_TYPE_FALLBACK` → its taxonomy's fallback), preserving today's exact code-documentation entries so `code` mode is behaviorally unchanged.
- Add a minimal `PERSONAL_DOC_TYPES` taxonomy matching the canonical personal-wiki surfaces (quickstart, sources, topics/themes, commitments, logistics, open questions).
- Add `getTaxonomyForMode(outputMode)` (or `mode`) that selects the code vs. personal taxonomy from the mode context both seams already carry.
- Thread the selected taxonomy through the two consumers:
  - `createOkfContractSection()` → the OKF directory-contract prompt block (`createSystemPrompt(command, { outputMode, okf })`).
  - `stampPage()` → directory-based `type` inference (via `runOkfPass` / `verifyOkfConformance`, both called with mode context in scope).
- Keep the OKF carrier unchanged: frontmatter shape, root `index.md`, `log.md`, `--okf`, and `--okf-check` behavior are untouched.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `okf-conformance`: the "type is inferred from directory via the repository documentation taxonomy" requirement changes from a single global code taxonomy to a per-mode pluggable taxonomy, selected from run mode; `code` mode keeps today's exact behavior and a new `personal` taxonomy is added.

## Impact

- `src/constants.ts`: `REPO_DOC_TYPES` / `REPO_DOC_TYPE_FALLBACK` / `getRepoDocTypeForDirectory` (renamed and generalized), new `DocTypeTaxonomy`, `CODE_DOC_TYPES`, `PERSONAL_DOC_TYPES`, `getDocTypeForDirectory`, `getTaxonomyForMode`.
- `src/agent/prompt.ts`: `createOkfContractSection()` takes a taxonomy; threaded from `createSystemPrompt`.
- `src/agent/okf.ts`: `stampPage()` takes a taxonomy; threaded from `runOkfPass` / `verifyOkfConformance`.
- `src/agent/index.ts`, `src/cli.tsx`: pass mode-derived taxonomy into the OKF pass and conformance check.
- Tests: `test/prompt.test.ts`, `test/constants.test.ts` (renamed constant + new per-mode coverage).
- No CLI-surface, frontmatter-format, or config changes; no new dependencies.
