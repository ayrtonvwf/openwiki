## Context

The OKF conformance pass (`src/agent/okf.ts`) stamps deterministic frontmatter on every non-reserved page, inferring each page's `type` from its top-level directory. Inference is driven by a single module-global map, `REPO_DOC_TYPES` (`src/constants.ts:359`), inverted into `DIRECTORY_TO_REPO_DOC_TYPE` and consumed through `getRepoDocTypeForDirectory()`. The same map is rendered into the system prompt's OKF directory contract by `createOkfContractSection()` (`src/agent/prompt.ts:172`) so the model organizes pages into directories the pass can classify.

Post-merge, OpenWiki has a mode axis: `OpenWikiRunMode = "personal" | "code"` (`src/cli.tsx:12`), mapped to `OpenWikiOutputMode = "local-wiki" | "repository"` via `getRunModeOutputMode()` (`src/cli.tsx:3880`). Both OKF seams already carry this mode context:

- `createSystemPrompt(command, { outputMode, okf })` — `outputMode` is already an option (`src/agent/prompt.ts:22`).
- `runOkfPass(cwd, { command, changeSummary })` is called at `src/agent/index.ts:243` where `outputMode` is in scope; `verifyOkfConformance(process.cwd())` is called at `src/cli.tsx:918` where the run mode is known.

The taxonomy is the only mode-specific piece; the rest of the OKF carrier (frontmatter shape, `index.md`, `log.md`, `--okf`, `--okf-check`) is mode-agnostic and stays unchanged.

## Goals / Non-Goals

**Goals:**

- Make the `type` taxonomy a first-class value selected by run mode, without changing the OKF carrier.
- Preserve `code`-mode behavior exactly (same types, same directories, same fallback).
- Add a minimal, sensible `personal` taxonomy so personal wikis stop collapsing to the code `Reference` fallback.
- Keep the prompt contract and the stamping pass reading from the _same_ selected taxonomy, so advertised directories always match inferred types.
- Preserve the existing load-time validation of taxonomy entries (alphabetic labels, kebab-case directories).

**Non-Goals:**

- Changing frontmatter fields, `index.md`/`log.md` generation, or the `--okf` / `--okf-check` surfaces.
- Sub-directory or content-based type inference. Inference stays keyed on the top-level directory only.
- Distinguishing multiple personal root-level files (quickstart, themes, commitments, …) by type — directory-based inference maps every root file to one `""` entry; finer typing is out of scope.
- Any CLI flags, config keys, or new dependencies.

## Decisions

**1. `DocTypeTaxonomy` as an explicit value, not a global.**
Define `type DocTypeTaxonomy = { types: Readonly<Record<string, string>>; fallback: string }` (with the inverted directory→type map precomputed once per taxonomy). Replace the module-global `getRepoDocTypeForDirectory(dir)` with a pure `getDocTypeForDirectory(taxonomy, dir): { type, isFallback }`. Rationale: threading an explicit value is the smallest change that makes the seam pluggable and keeps the lookup pure/testable. Alternative — a mutable module-level "current taxonomy" — was rejected as hidden global state that breaks under concurrent runs and is harder to test.

**2. Rename, don't fork.** Rename `REPO_DOC_TYPES` → `CODE_DOC_TYPES` and fold `REPO_DOC_TYPE_FALLBACK` into that taxonomy's `fallback`. The code taxonomy keeps today's exact entries so `code` mode is byte-for-byte unchanged. Rationale: makes the "code vs personal" split obvious at the definition site and prevents a stale duplicate.

**3. Select by mode via `getTaxonomyForMode`.** Add `getTaxonomyForMode(mode)` keyed on the axis both seams already have. Keying on `OpenWikiOutputMode` (`repository` → code, `local-wiki` → personal) is the least-invasive choice because `outputMode` is already the parameter both seams pass; `OpenWikiRunMode` would require plumbing a new parameter through `createSystemPrompt`/`runOkfPass`. Decide the exact input type during implementation, defaulting to `outputMode`.

**4. Minimal personal taxonomy.** Map the canonical personal-wiki surfaces from the local-wiki synthesis contract (`src/agent/prompt.ts` `localWikiSynthesisInstruction`): root `""` → `Overview` (quickstart and other root canonical files), `sources` → `Source`, `topics` → `Topic`; fallback `Note`. Kept intentionally small; entries are one-liners and easy to extend. All labels/directories satisfy the existing `assertSanitized*` patterns.

**5. Thread through both seams, default preserved.** `createOkfContractSection(taxonomy)` and `stampPage(relativePath, rawContent, now, taxonomy, priorState?)` take the taxonomy explicitly. Callers select it from mode; where no mode is available (pure unit tests), default to `CODE_DOC_TYPES` to preserve current call shapes where practical.

## Risks / Trade-offs

- **Signature changes ripple to callers/tests** → The two seam functions and their callers (`runOkfPass`, `verifyOkfConformance`, `createSystemPrompt`) change shape; `test/prompt.test.ts` and `test/constants.test.ts` reference the renamed constant. Mitigation: rename with a repo-wide search, update the two tests, add per-mode coverage; TypeScript compilation surfaces any missed call site.
- **Personal taxonomy may be too sparse** → early personal wikis might still hit the `Note` fallback often. Mitigation: fallback is non-empty and reported as a fallback classification (unchanged behavior); the taxonomy is one-line-per-entry extensible.
- **Mode/outputMode coupling** → keying on `outputMode` conflates "personal" with "local-wiki". Today the mapping is 1:1, so this is safe; if the axes diverge later, switch `getTaxonomyForMode` to take `OpenWikiRunMode`.

## Migration Plan

Pure refactor, no data migration. Existing stamped `code` pages re-stamp to identical `type` values. Personal pages that previously fell back to `Reference` will re-stamp to personal types on the next `--okf` run (a normal deterministic re-stamp; only changed bodies advance the timestamp). Rollback is reverting the change; no persisted state depends on it.

## Open Questions

- Final input type for `getTaxonomyForMode` — `OpenWikiOutputMode` (default) vs. `OpenWikiRunMode`. Resolve at implementation based on which keeps call sites cleanest.
- Exact personal type labels (`Overview` / `Source` / `Topic` / `Note`) — confirm against the canonical personal surfaces before finalizing; they are easy to adjust and do not affect the carrier.
