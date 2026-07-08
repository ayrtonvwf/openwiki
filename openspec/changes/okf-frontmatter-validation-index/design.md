## Context

OpenWiki's agent writes Markdown into `openwiki/` via an LLM-driven DeepAgents run; there is no templating layer, so the prompt is today's only "spec" for output shape. Phase 1 added the `--okf`/`OPENWIKI_OKF` opt-in (`resolveOkfEnabled` in `src/constants.ts`, `okf?: boolean` on `OpenWikiRunOptions`) and the `REPO_DOC_TYPES` taxonomy. Phase 2 added an OKF contract section to `createSystemPrompt` (`src/agent/prompt.ts`) instructing the model to write body-only content (no frontmatter, bundle-relative absolute links, a `# Citations` section, directories matching the taxonomy) and to leave existing frontmatter untouched during edits.

Nothing today parses, validates, or writes frontmatter, and nothing generates a root `index.md`. `specs/openwiki-okf-implementation-report.md` (§4.2, §4.3, §4.5, §7) analyzes VectifyAI/OpenKB as prior art and recommends its central architectural decision: code owns the frontmatter block entirely, the model never emits one, and validation is a _check_ rather than the primary conformance mechanism.

The integration point is `runOpenWikiAgentCore` in `src/agent/index.ts`, which today does:

```
if (command !== "chat" && openWikiSnapshotBefore !== (await createOpenWikiContentSnapshot(cwd))) {
  await writeLastUpdateMetadata(command, cwd, modelId);
}
```

This proposal's pass must run in that branch, before or alongside `writeLastUpdateMetadata`, and only when `options.okf === true`.

## Goals / Non-Goals

**Goals:**

- Guarantee, deterministically, that every non-reserved `.md` page under `openwiki/` has parseable frontmatter with a non-empty `type` after any `--okf` run — regardless of what the model did.
- Generate a spec-conformant root `openwiki/index.md` with `okf_version: "0.1"` and a link to `quickstart.md`.
- Make the frontmatter block safe against the single known parser bug class (naive `---` scanning truncating on a quoted value that itself contains `---`).
- Report conformance (pass/fail + issues) so a run's caller (CLI, CI) can see or act on the result.
- Keep the pass a no-op, byte-for-byte, when `--okf` is off.
- Keep the pass idempotent on unchanged content — rerunning it must not rewrite files whose stamped fields would be identical, to protect the existing content-snapshot no-op optimization in `src/agent/utils.ts`.

**Non-Goals:**

- Reconciling `timestamp` churn with the content-snapshot no-op check across genuinely-edited pages (Phase 4). This proposal defines the stamping rule that unchanged bodies keep their prior `timestamp`, but does not implement cross-run body-hash tracking beyond straightforward same-run idempotence.
- `log.md` generation (Phase 4).
- README/DEVELOPMENT documentation, CI conformance workflow, example workflow changes (Phase 5).
- Any change to the CLI flag, env key, or prompt contract themselves — those are Phase 1/2 and considered stable inputs to this pass.
- A general-purpose YAML frontmatter editor for arbitrary third-party Markdown; this module only needs to handle OpenWiki-generated pages and the shapes this proposal itself writes.

## Decisions

### 1. Code owns the entire frontmatter block; the pass is a full stamp on every run, not just a fill-in-the-gaps repair

Every `--okf` run recomputes `type`/`title`/`description` for every page from the current body and overwrites the frontmatter block with the canonical serialization, rather than trying to merge in place. This matches OpenKB's model (§7 of the report) and avoids an entire class of "the model half-wrote frontmatter, now we have to merge it" bugs. `timestamp` is the one field with special-case logic: preserve the previous value when the page's body content is unchanged since the last stamp (compare against the previously stored body, i.e. the file content below the frontmatter block, hashed), otherwise set to the current run's ISO-8601 timestamp. This keeps idempotence: on a second run with no edits, every field, including `timestamp`, resolves to the same value, so the file is not rewritten at all (the write helper is expected to skip writing when new content matches old content byte-for-byte).

**Alternative considered**: merge-only repair (only fill missing fields, leave existing ones as the model wrote them). Rejected because it makes conformance dependent on the model never producing a malformed or partial block, exactly the failure mode this phase exists to close.

### 2. Frontmatter parsing is hand-rolled for the split/detect step, but scalar (de)serialization delegates to a real YAML library

The `---`/`---` block boundaries are found with a line-anchored regex (`/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`) against the start of the file, never a naive `indexOf`. Once the raw YAML text between the delimiters is isolated, parsing and serializing the key/value map is delegated to the `yaml` package rather than hand-writing a YAML parser: `yaml` is already present in the pnpm lockfile (pulled transitively by `vite`/`tsx` at version 2.9.0 today) but only as a dev-tooling transitive, not a real runtime dependency of the published package, so it is added explicitly to `dependencies` in `package.json`. Every value this module writes is passed through `JSON.stringify` before being placed in the YAML map (JSON is a valid YAML subset), which guarantees single-line, correctly-escaped scalars that any spec-compliant YAML parser (including this module's own on the next run) can round-trip.

**Alternative considered**: a fully hand-rolled `key: value` line parser with no dependency, matching the report's description of OpenKB's Python approach exactly. Rejected because OpenWiki has no `safe_load`-equivalent guarantee without an actual YAML parser, and the report explicitly allows adding a minimal YAML dependency; reusing `yaml` (already resolvable in the lockfile) is a smaller diff than hand-rolling a parser and is more likely to agree with external OKF consumers that use real YAML parsers.

### 3. Directory→type inference reuses `REPO_DOC_TYPES` verbatim; unknown directories get a `Reference` fallback, reported but not failed

`REPO_DOC_TYPES` maps type labels to directories (e.g. `Architecture` → `architecture`). This pass inverts that map (directory → type) once at module load. A page whose top-level directory doesn't match any entry (including pages the model placed in an unanticipated directory) is stamped with the `Reference` type as a safe default and flagged in the conformance report as "type inferred by fallback, verify directory placement" — never left without a `type`, since OKF's one hard requirement is that the field be non-empty, and unknown _values_ are spec-tolerated per §9, but a _missing_ field is not.

### 4. Reserved-file handling is explicit, not inferred from a naming convention search

`index.md` and `log.md` are recognized by exact filename match at any directory depth for the "exempt from `type` requirement" rule (per OKF §6), but only the bundle-root `openwiki/index.md` is eligible to carry a frontmatter block at all (the `okf_version` declaration). Any other `index.md` (e.g. `openwiki/architecture/index.md`, should the model ever create one) must have no frontmatter injected by this pass and is flagged by the validator if it carries one. `.last-update.json` is excluded by extension (`.md` only) before any reserved-file logic runs, so it is never inspected or written by this module.

### 5. Traversal is shared with `src/agent/utils.ts`, not reimplemented

`addDirectoryToSnapshot` in `src/agent/utils.ts` already recursively walks `openwiki/`, sorts entries deterministically, and skips `UPDATE_METADATA_PATH`. This proposal extracts the walking/skip-list logic into an exported helper (e.g. `walkOpenWikiMarkdownFiles(cwd): Promise<string[]>`, returning repo-relative paths of `.md` files only) that both the snapshot hasher and `okf.ts` call, instead of `okf.ts` re-implementing directory recursion. The snapshot hasher's hashing behavior is unchanged; only the traversal is shared.

### 6. Atomic writes via a temp-file-plus-rename helper local to `okf.ts`

Each mutated file is written to a sibling temp path (e.g. `<file>.okf-tmp-<random>`) and renamed into place, matching OpenKB's `atomic_write_text` (§7). No existing atomic-write helper exists elsewhere in the codebase to share, so this proposal adds one scoped to `okf.ts`; a future phase can promote it to a shared utility if another module needs it.

### 7. The pass runs and reports, but does not throw on a non-conformant result by default

`runOkfPass(cwd)` (or similar) always attempts to repair what it can and returns a structured report (`{ conformant: boolean, issues: Array<{ file, message }> }`). `src/agent/index.ts` surfaces this via a new optional `okfConformant?: boolean` on `OpenWikiRunResult` and via `onEvent` (a `text` or `debug` event summarizing pass/fail counts), but does not itself throw. The issue text raises "optionally fail non-interactive/CI runs with a non-zero exit when `--okf` is set and repair is disabled" as a stretch goal; this design defers a `--okf-strict`/exit-code contract to a later phase since no such flag exists yet and inventing one is out of scope for "make the tool conformant" — this phase's repair path is unconditional (always on), which makes a "repair disabled" mode moot until requested.

## Risks / Trade-offs

- **New runtime dependency (`yaml`)** → Mitigated by using a small, widely-used, already-resolvable-in-lockfile package; footprint stays minimal per OKF's own ethos.
- **Full re-stamp on every run risks rewriting files that only need one field touched, generating noisy diffs** → Mitigated by the idempotence rule (§ Decision 1): unchanged bodies produce byte-for-byte identical frontmatter, so the atomic-write helper's write is a no-op comparison away from a real write; no file is rewritten unless its resolved frontmatter actually changed.
- **`description` derived from "first sentence of body" can be low quality if the model's first paragraph isn't a clean summary** → Mitigated by the Phase 2 prompt already asking for a short factual first paragraph; this pass's fallback (naive first-sentence extraction) only applies when that convention isn't followed, and is flagged as a soft warning in the conformance report, not a hard failure.
- **Directory→type inference can silently misclassify a page placed in an unexpected directory** → Mitigated by the `Reference` fallback + explicit report flag (Decision 3) rather than silent success or a hard failure that blocks the run.
- **Sharing traversal with `createOpenWikiContentSnapshot` risks behavior drift in the snapshot hash if not done carefully** → Mitigated by extracting only the _walk_ (path listing + skip rules), not the hashing itself, so the snapshot's hash inputs are unchanged.

## Migration Plan

- Purely additive: no existing `--okf` behavior contract changes for callers, since no consumer today depends on unstamped frontmatter (Phase 2 shipped no consumer of that behavior). Rollout is via normal merge; no data migration, no flag flip required for non-`--okf` users.
- Rollback is deleting/reverting `src/agent/okf.ts` and its one call site in `src/agent/index.ts`; no persisted state format changes (the pass only touches `openwiki/*.md` content, which is already git-tracked and revertable).

## Open Questions

- Should `resource` ever be populated automatically (e.g. a permalink to the primary source file a page documents), or left absent until a future phase defines that convention? This proposal leaves `resource` unset unless a page's frontmatter already had one before this pass ran (preserved, not invented).
- Should the conformance report be persisted anywhere (e.g. alongside `.last-update.json`) for later inspection, or is an in-run `onEvent`/return-value report sufficient for this phase? This proposal treats the report as run-output-only; persisting it is left to a later phase if CI wants machine-readable history.
