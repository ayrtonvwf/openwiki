# Implementing Optional OKF Output in OpenWiki

**Report for [langchain-ai/openwiki#84](https://github.com/langchain-ai/openwiki/issues/84) — "Add optional Open Knowledge Format (OKF) output"**

Date: 2026-07-06

---

## 1. Executive summary

Issue #84 asks OpenWiki to optionally emit its generated wiki in [Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) — Google Cloud's minimal, vendor-neutral standard of "a directory of markdown files with YAML frontmatter." The goal is portability: once OpenWiki's output conforms to OKF, external agents, knowledge catalogs, and search tools can consume it without bespoke parsing.

The good news is that OpenWiki is already ~70% of the way there structurally. It already produces a directory tree of cross-linked Markdown under `openwiki/`, already maintains an entrypoint page (`quickstart.md`), and already tracks incremental-update state (`.last-update.json`). OKF conformance is therefore mostly **additive and mechanical**, not a rewrite. The three real gaps are: (1) OpenWiki pages carry **no YAML frontmatter**, and OKF's single hard requirement is a parseable frontmatter block with a non-empty `type` field on every non-reserved page; (2) there is **no `index.md`** with a version declaration; and (3) there is **no validation** step to assert conformance.

Because OpenWiki generates documentation with an LLM agent driven by a system prompt (`src/agent/prompt.ts`), most of the "work" is prompt engineering plus a deterministic post-generation validation/normalization pass — not hand-written formatting logic. The opt-in is a configuration flag threaded from the CLI/env down to the prompt builder.

There is also usable prior art: [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) already ships OKF-conformant output, and §7 distills its source into concrete patterns OpenWiki can match — most importantly, that frontmatter should be owned by code, not written by the model.

The rest of this report maps each requested capability to concrete source files and describes an incremental, backward-compatible implementation.

---

## 2. Background: what OKF v0.1 actually requires

From the [OKF v0.1 draft spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), a bundle is a directory tree of Markdown files. The normative conformance bar (spec §9) is deliberately tiny:

1. Every non-reserved `.md` file contains a **parseable YAML frontmatter block**.
2. Every frontmatter block contains a **non-empty `type` field**. (This is the _only_ required field.)
3. Reserved filenames (`index.md`, `log.md`) follow their prescribed structure when present.

Everything else is soft guidance. Consumers must tolerate unknown types, missing optional fields, unknown extra keys, and broken links. Key structural facts relevant to OpenWiki:

- **Concept documents** each get frontmatter with one required key (`type`) and recommended keys `title`, `description`, `resource`, `tags`, `timestamp` (spec §4.1).
- **Concept ID = file path minus `.md`.** Cross-links are normal Markdown links; **bundle-relative absolute links** (starting with `/`, e.g. `/architecture/overview.md`) are the recommended, move-stable form (spec §5.1).
- **`index.md`** is a reserved file: it enumerates the directory's contents for progressive disclosure, contains **no frontmatter** — with one exception: the **bundle-root `index.md`** is the only place frontmatter is permitted, used to declare `okf_version: "0.1"` (spec §6, §11).
- **`log.md`** is a reserved optional file: a flat list of ISO-8601 date-grouped change entries, newest first (spec §7).
- Conventional body headings `# Schema`, `# Examples`, `# Citations` carry defined meaning (spec §4.2, §8).

The proposal in the issue maps cleanly onto these: YAML frontmatter, a stable type taxonomy, a root `index.md` with a version declaration, metadata preservation across updates, basic OKF validation, and a backward-compatible opt-in.

---

## 3. Where OpenWiki stands today (gap analysis)

OpenWiki is a TypeScript CLI (`src/cli.tsx`) that drives a DeepAgents-based documentation agent. The agent is instructed entirely through a system/user prompt pair built in `src/agent/prompt.ts`; the model then uses filesystem tools to write Markdown into `openwiki/`. There is no deterministic templating layer that formats pages — the _prompt_ is the spec for the output. This is the single most important architectural fact for this feature: **to change the output format, you primarily change the prompt, then add a deterministic guardrail pass.**

Current output (observed in the repo's own `openwiki/` tree):

```
openwiki/
├── .last-update.json
├── quickstart.md
├── agent/workflow.md
├── architecture/overview.md
├── cli/usage.md
└── operations/credentials-and-updates.md
```

| OKF requirement                                                 | OpenWiki today                                                           | Gap                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| YAML frontmatter on every concept page                          | Pages are pure Markdown, no frontmatter (see `architecture/overview.md`) | **Yes — primary gap**  |
| Non-empty `type` on every page                                  | No type metadata exists                                                  | **Yes**                |
| Root `index.md` + `okf_version` declaration                     | Entry point is `quickstart.md`, no `index.md`, no version key            | **Yes**                |
| Reserved `index.md` per directory (progressive disclosure)      | Navigation is via prose links in `quickstart.md`                         | Partial                |
| Bundle-relative absolute cross-links (`/dir/page.md`)           | Prompt asks for "stable links" but not `/`-rooted convention             | Minor                  |
| `log.md` update history                                         | History lives in `.last-update.json` (machine JSON, not OKF `log.md`)    | Optional gap           |
| Conventional headings (`# Schema`, `# Examples`, `# Citations`) | Uses ad-hoc headings (`# Source map`, `# Things to watch`)               | Cosmetic               |
| Metadata preserved across incremental updates                   | `.last-update.json` snapshot logic exists in `src/agent/utils.ts`        | Reusable foundation    |
| Validation / conformance check                                  | None                                                                     | **Yes**                |
| Backward-compatible opt-in                                      | Everything is single-format today                                        | **Yes — needs a flag** |

Net: three substantive gaps (frontmatter+type, root index/version, validation), one config gap (opt-in), and several cosmetic alignments.

---

## 4. Proposed design

### 4.1 Opt-in configuration (backward compatible)

OKF output must be strictly opt-in and off by default, so existing users' wikis are untouched. OpenWiki already has three parallel configuration channels that a new setting should thread through consistently:

- **CLI flag** — add `--okf` (and `--no-okf`) parsing in `src/commands.ts`. The parser (`parseCommand`) already returns a structured `CliCommand` object; add an `okf: boolean` field alongside `dryRun`, `modelId`, `print`. Add matching rows to `helpContent.options` and an example, since help text and parser behavior are intentionally coupled (noted in the repo's own architecture doc).
- **Environment/config key** — add `OPENWIKI_OKF` to `src/constants.ts` (next to `OPENWIKI_PROVIDER_ENV_KEY` / `OPENWIKI_MODEL_ID_ENV_KEY`) and register it in `managedEnvKeys` in `src/env.ts` so it round-trips through `~/.openwiki/.env` and shows up in credential diagnostics. Provide a `resolveOkfEnabled(env)` helper mirroring `resolveConfiguredProvider()`.
- **Resolution precedence** — CLI flag > env var > default(false), matching the existing provider-resolution pattern.

Threading: `src/cli.tsx` passes the resolved boolean into the agent run options (`OpenWikiRunOptions` in `src/agent/types.ts` gains `okf?: boolean`), and `src/agent/index.ts` forwards it to the prompt builder.

### 4.2 Frontmatter generation (the core change)

There are two ways to get frontmatter onto every page: instruct the model to write it, or have code stamp it. **The reference implementation in this space (VectifyAI/OpenKB — see §7) deliberately does the latter, and the evidence strongly favors that choice.** OpenKB's own page schema tells the model, verbatim: _"Frontmatter (managed by code — do NOT emit it in generated content) … Do not include YAML frontmatter (---) in generated content; it is managed by code."_ The model writes the Markdown body only; a deterministic pass owns the entire `---` block. This makes conformance a property of the tool rather than of the model's consistency, and it neatly sidesteps the `timestamp`-churn problem in §4.6.

Recommended design for OpenWiki, mirroring that pattern:

1. **Prompt change is subtractive, not additive.** When OKF is enabled, `createSystemPrompt(command, { okf })` in `src/agent/prompt.ts` instructs the model to write body content only (headings, prose, tables), to use bundle-relative absolute links (`/architecture/overview.md`), conventional headings, and a `# Citations` section — and to _not_ emit a YAML frontmatter block, because the tool will add it. Optionally, the prompt asks the model to put a one-line summary as the first paragraph so code can lift it into `description`.
2. **Code owns the frontmatter block.** A new deterministic module (`src/agent/okf.ts`, §4.5) runs after the agent completes and, for every non-reserved page, stamps/refreshes the block:
   - `type` — **inferred from the page's directory** via the taxonomy (§4.4). OpenKB infers type from the subdir (`summaries/`→`Summary`, `concepts/`→`Concept`, etc.); OpenWiki maps `architecture/`→`Architecture`, `operations/`→`Operations`, and so on.
   - `title` — derived from the first `#` heading (fall back to filename).
   - `description` — the model-supplied one-liner, or first sentence of the body.
   - `timestamp` — set by code (ISO-8601), preserved for unchanged bodies (§4.6).
   - `resource` — added only where a page maps to a concrete asset.

This inverts my earlier "prompt-first, validator-as-safety-net" framing: OpenKB shows that **prompt-never-touches-frontmatter, code-always-does** is simpler and more robust. The validator (§4.5) then only has to _check_, and repair is rarely needed because generation is deterministic.

### 4.3 Root `index.md` and version declaration

When OKF is enabled, the bundle must have a root `openwiki/index.md` that (a) declares `okf_version: "0.1"` in a frontmatter block — the one place OKF allows frontmatter in an index file — and (b) lists top-level sections for progressive disclosure. Two viable approaches:

1. **Prompt-driven**: instruct the agent to author `index.md` as the navigation root (in addition to, or replacing, `quickstart.md`'s role). Keep `quickstart.md` as a linked concept page for backward compatibility.
2. **Deterministic generation**: after the agent finishes, a post-processor synthesizes `index.md` by scanning each page's frontmatter `title`/`description`. This is more reliable and is exactly the "index generators MAY be automatic" path the spec anticipates (§6). **Recommended:** deterministic generation of `index.md`, so the version declaration and listing are never left to model discretion.

Note a required tweak to the entrypoint contract: today the prompt hard-requires `quickstart.md` as the entrypoint ("`${OPEN_WIKI_DIR}/quickstart.md` must be the entrypoint"). In OKF mode, `index.md` becomes the bundle entry surface. Keep both; have `index.md` link to `quickstart.md`.

### 4.4 Type taxonomy

OKF does not register types centrally (spec §4.1), but the issue asks for a "stable repository-documentation type taxonomy" so OpenWiki output is internally consistent and predictable for consumers. Define this as a constant in `src/constants.ts`, e.g.:

| `type` value          | Applied to                               |
| --------------------- | ---------------------------------------- |
| `Repository Overview` | Root/quickstart landing content          |
| `Architecture`        | System/architecture pages                |
| `Workflow`            | Process/agent-workflow pages             |
| `Domain Concept`      | Business/domain model pages              |
| `API Reference`       | API/route/interface docs                 |
| `Data Model`          | Schema/storage pages                     |
| `Operations`          | Ops, credentials, deployment, runbooks   |
| `Integration`         | Third-party/provider integrations        |
| `Testing`             | Test/eval guidance                       |
| `Reference`           | Source maps and miscellaneous references |

The taxonomy should be surfaced in the prompt (so the model picks from it) and enumerated in the validator (as the _suggested_ set, while still tolerating unknown types to stay spec-compliant). Keeping it a single exported constant means adding a type later is a one-line change, matching how `PROVIDER_CONFIGS` centralizes provider support.

### 4.5 Validation and normalization

Add a deterministic module, e.g. `src/agent/okf.ts`, run after the agent completes an init/update (invoked from `src/agent/index.ts`, near where `writeLastUpdateMetadata` is called). Responsibilities:

- **Parse** frontmatter of every non-reserved `.md` file under `openwiki/` (reuse the existing recursive directory walk in `src/agent/utils.ts` — `addDirectoryToSnapshot` already knows how to traverse the tree and skip metadata files).
- **Validate** against OKF §9: parseable frontmatter present; non-empty `type`; `index.md`/`log.md` structural rules.
- **Normalize/repair** where safe: if a page is missing frontmatter or `type`, inject a default block (deriving `title` from the first `#` heading or filename, inferring `type` from the directory name via the taxonomy, stamping `timestamp`). This guarantees conformance even when the model forgets.
- **Report**: emit a conformance summary (pass/fail + per-file issues) to the run output, and optionally fail non-interactive/CI runs with a non-zero exit when `--okf` is set and repair is disabled.

This maps almost one-to-one onto OpenKB's `openkb/lint.py`, which is worth reading as a template (§7). Its `find_missing_okf_fields()` is literally an OKF check — _"OKF v0.1 requires every non-reserved knowledge page to carry a non-empty `type`"_ — scoped to content directories and exempting `index.md`/`log.md`/`sources/`. Its `find_invalid_frontmatter()` catches the exact failure mode to worry about: a value like an unquoted colon-bearing `description:` that OpenWiki's own string-slicing might tolerate but that external YAML-aware consumers reject. Its `check_index_sync()` verifies `index.md` links resolve and that every content page is listed. And `run_structural_lint()` emits a Markdown report with a dedicated "OKF Conformance" section. OpenWiki's `okf.ts` should provide the TypeScript equivalents of these four checks.

Dependencies: a YAML parser is needed. Check `pnpm-lock.yaml`/`package.json` for an existing one (LangChain/DeepAgents pull in transitive deps); otherwise add a small, well-scoped library such as `yaml` or `gray-matter` (frontmatter-aware). Keep the footprint minimal — OKF's whole ethos is "just markdown, just YAML frontmatter, no SDK." One robustness detail to copy from OpenKB's `frontmatter.py`: match the closing `---` **anchored to the start of a line** (`\n---`), never with a naive `indexOf("---", 3)`, so a `---` inside a quoted value can't truncate the block; and serialize scalar values as JSON (a strict subset of YAML) to guarantee single-line, correctly-escaped values that round-trip through `safe_load`.

### 4.6 Metadata preservation across incremental updates

This is where OpenWiki's existing machinery is a real asset. `src/agent/utils.ts` already:

- Computes a SHA-256 content snapshot of `openwiki/` **excluding `.last-update.json`** (`createOpenWikiContentSnapshot`), and writes metadata **only when content actually changed** (`writeLastUpdateMetadata`), preventing update loops in scheduled CI.
- Detects no-op updates (`getUpdateNoopStatus`) by diffing git head and ignoring changes confined to OpenWiki's own paths.

Two interactions to handle for OKF:

1. **Frontmatter must survive surgical updates.** The update-mode prompt already emphasizes surgical edits ("prefer replacing one stale sentence over adding new paragraphs"). Add an explicit rule in OKF mode: **never drop or rewrite existing frontmatter except the fields whose underlying facts changed** (e.g. bump `timestamp`, adjust `tags`), preserving producer-added keys per spec §4.1's round-trip guidance. Back this with the validator's repair pass as a safety net.
2. **`timestamp` churn vs. the snapshot check.** If the model rewrites every page's `timestamp` on every run, the content snapshot always changes and the "no-op update" optimization breaks. Mitigation: instruct the model to only change `timestamp` on pages it actually edits, and have the normalizer **preserve prior `timestamp` values for unchanged bodies** (compare body hash to the previous snapshot). This keeps the valuable no-op detection intact.

Optionally, generate OKF `log.md` files from the same change information already captured in `.last-update.json` + git summary, giving human-readable history in-format while keeping the JSON for machine state.

### 4.7 Reserved-file coexistence

`.last-update.json` stays as OpenWiki's internal state file. It is not a `.md` file, so it does not affect OKF conformance (validation only inspects `.md` files), and the snapshot logic already excludes it. No conflict. The only new reserved files OKF introduces are `index.md` and `log.md`, neither of which OpenWiki currently uses, so there is no collision with existing page names.

---

## 5. File-by-file change map

| File                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands.ts`                 | Parse `--okf` / `--no-okf`; add `okf: boolean` to the `run` `CliCommand`; add help rows + example.                                                                                                                                                                                                                                                                                                                        |
| `src/constants.ts`                | Add `OPENWIKI_OKF_ENV_KEY`, `OKF_VERSION = "0.1"`, the `REPO_DOC_TYPES` taxonomy constant, and a `resolveOkfEnabled()` helper.                                                                                                                                                                                                                                                                                            |
| `src/env.ts`                      | Add `OPENWIKI_OKF` to `managedEnvKeys` so it persists to `~/.openwiki/.env` and appears in diagnostics.                                                                                                                                                                                                                                                                                                                   |
| `src/cli.tsx`                     | Resolve the OKF setting (flag > env > default) and pass it into the agent run options; surface it in dry-run output.                                                                                                                                                                                                                                                                                                      |
| `src/agent/types.ts`              | Add `okf?: boolean` to `OpenWikiRunOptions`; consider an `okfConformant?: boolean` on `OpenWikiRunResult`.                                                                                                                                                                                                                                                                                                                |
| `src/agent/prompt.ts`             | Thread the OKF flag into `createSystemPrompt`; append the OKF output-contract section (frontmatter rules, taxonomy, absolute links, conventional headings, update-mode frontmatter-preservation rule).                                                                                                                                                                                                                    |
| `src/agent/index.ts`              | Forward the flag to the prompt builder; after a successful run, invoke the OKF validator/normalizer and (optionally) `index.md`/`log.md` generation before/around `writeLastUpdateMetadata`.                                                                                                                                                                                                                              |
| `src/agent/utils.ts`              | Reuse the directory walk; optionally factor the traversal so the OKF module can share it; add body-hash-aware `timestamp` preservation if implementing §4.6.2.                                                                                                                                                                                                                                                            |
| `src/agent/okf.ts` _(new)_        | **Owns frontmatter**: parse/split/set/drop helpers (model `src/agent/frontmatter.ts` on OpenKB's `frontmatter.py`), deterministic stamping of `type`/`title`/`description`/`timestamp`, conformance validation (OKF §9), safe repair, deterministic `index.md` generation with `okf_version`, optional `log.md` generation, atomic writes, conformance reporting. Direct references: OpenKB `frontmatter.py` + `lint.py`. |
| `package.json` / `pnpm-lock.yaml` | Add a frontmatter/YAML dependency if none is already available transitively.                                                                                                                                                                                                                                                                                                                                              |
| `README.md` / `DEVELOPMENT.md`    | Document the `--okf` flag, the taxonomy, and conformance guarantees.                                                                                                                                                                                                                                                                                                                                                      |
| `examples/openwiki-update.yml`    | Optionally show `--okf` usage in the scheduled-update GitHub Action.                                                                                                                                                                                                                                                                                                                                                      |
| Tests                             | Unit-test the parser, validator, normalizer, and `index.md` generator; add a conformance fixture bundle.                                                                                                                                                                                                                                                                                                                  |

---

## 6. Phased implementation plan

**Phase 1 — Plumbing (low risk).** Add the `--okf` flag, env key, resolution helper, types, and CLI threading. No output change yet; `--okf` is accepted but inert. Ships the backward-compatible opt-in skeleton.

**Phase 2 — Frontmatter + taxonomy via prompt.** Extend `createSystemPrompt` with the OKF contract and the taxonomy constant. At this point OKF runs produce frontmatter'd pages, but conformance depends on the model.

**Phase 3 — Deterministic guardrails.** Add `src/agent/okf.ts`: parse, validate (§9), repair, and generate root `index.md` with `okf_version: "0.1"`. Wire it into `src/agent/index.ts`. Now conformance is guaranteed by the tool, not the model. This is the phase that actually satisfies the issue's "basic OKF validation" and "root index.md" items.

**Phase 4 — Update-safe metadata.** Implement frontmatter/`timestamp` preservation across surgical updates and reconcile with the content-snapshot no-op logic. Optionally emit `log.md`.

**Phase 5 — Docs, tests, polish.** README/DEVELOPMENT updates, conformance fixtures, CI conformance check, example workflow.

Phases 1–3 deliver a usable, spec-conformant `--okf` mode; 4–5 harden it for scheduled/CI use.

---

## 7. Reference implementation: patterns from VectifyAI/OpenKB

[VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) is a Python CLI that already produces OKF-conformant output, and it is the closest available prior art for what issue #84 asks. OpenKB compiles ingested documents into a `wiki/` bundle of Markdown pages with YAML frontmatter; its `openkb/lint.py` contains explicit "OKF Conformance" checks. Reading its source surfaces several concrete, transferable patterns — and one architectural decision that is worth adopting wholesale.

**1. Frontmatter is code-managed, never model-emitted.** OpenKB's page schema (`openkb/schema.py`) instructs the model _not_ to write frontmatter; the compiler stamps `type` and `description` deterministically. The schema comment states plainly that `type` is _"the one field OKF requires; consumers use it for routing/filtering/presentation."_ This is the single most important pattern to match (folded into §4.2 above): it makes conformance guaranteed rather than probabilistic.

**2. A dedicated, hardened frontmatter module.** `openkb/frontmatter.py` is a single source of truth for `build / split / parse / set / drop` on the `---` block. Two defensive details are directly relevant to OpenWiki: (a) the closing delimiter is matched line-anchored (`\n---`) so a `---` inside a quoted value never truncates the block — the exact bug a naive parser hits; (b) values are serialized with `json.dumps` because JSON is a strict subset of YAML, guaranteeing single-line, correctly-escaped values. Its `set_line()` / `drop_line()` helpers mutate one key while preserving all others — this _is_ the "metadata preservation during incremental updates" mechanism the issue asks for.

**3. `description` deliberately replaces `brief`.** OpenKB renamed its one-line-summary field to `description` specifically to align with OKF's recommended field name (visible in both `schema.py` and its sample bundle). OpenWiki should use OKF's field names (`title`, `description`, `tags`, `timestamp`, `resource`) verbatim.

**4. Reserved files `index.md` + `log.md`, with a shared seed constant.** OpenKB implements both OKF reserved files. Its `INDEX_SEED` constant is shared between `init` and the compiler's lazy-create path _"so they never drift"_ — the same single-source-of-truth discipline OpenWiki should use for its root `index.md` and `okf_version` declaration. Its log format is a flat, date-stamped, append-only list (`## [YYYY-MM-DD HH:MM:SS] operation | description`), matching OKF §7.

**5. Type taxonomy as a defended config value.** `openkb/config.py` defines `DEFAULT_ENTITY_TYPES` and a `resolve_entity_types()` resolver: a default vocabulary, overridable per-KB via an `entity_types:` config key, with each value regex-cleaned (`[^a-z0-9 _-]` stripped) _so a stray brace or punctuation can't leak into a prompt template or a frontmatter value_, de-duped, and with an `other` fallback always appended. OpenWiki's `REPO_DOC_TYPES` taxonomy (§4.4) should follow this shape: a constant default, optionally overridable, defensively sanitized.

**6. Validation is a separate structural linter with an OKF section.** `openkb/lint.py` (§4.5) offers a ready-made blueprint: `find_missing_okf_fields`, `find_invalid_frontmatter`, `check_index_sync`, plus a `--fix` auto-repair path (`fix_broken_links` / `strip_ghost_wikilinks`) that rewrites fuzzy-matching links to canonical form and demotes unresolvable ones to plain text, writing a report under `reports/`. A shared `_load_wiki_pages()` reads every page once and feeds both frontmatter checks. `PAGE_CONTENT_DIRS` is a shared constant naming which directories hold conformant concept pages — used by list, lint, and status alike.

**7. Atomic writes for every mutation.** OpenKB routes all wiki writes through `atomic_write_text` (`openkb/locks.py`). Given OpenWiki runs in scheduled CI and can be interrupted, the OKF stamping/repair pass should write atomically too.

**Where OpenWiki should diverge from OpenKB.** OpenKB cross-links pages with Obsidian-style `[[wikilinks]]` and lints them, which is _not_ OKF's specified cross-linking; OKF §5 uses standard Markdown links, preferably bundle-relative absolute (`/dir/page.md`). OpenWiki should keep OKF-standard Markdown links and adapt OpenKB's ghost-link-stripping idea to that syntax rather than adopting wikilinks. The two tools also have different taxonomies (OpenKB: `summaries`/`concepts`/`entities` for a document KB; OpenWiki: `architecture`/`workflows`/`operations` for repo docs) — same mechanism, different vocabulary. Finally, OpenKB has a heavyweight `compiler.py` orchestrating generation; OpenWiki's agent writes files directly, so its equivalent of OpenKB's code-managed frontmatter is a _post-generation stamping pass_ in `src/agent/index.ts`, not an inline compiler stage.

**Net effect on this proposal.** OpenKB validates the overall plan and upgrades one decision: frontmatter should be owned by code (§4.2), not prompted-then-repaired. The `okf.ts` module in the file map (§5) should therefore be responsible for _both_ stamping and validating, with `frontmatter.py` and `lint.py` as direct design references.

---

## 8. Risks and open questions

- **Model consistency.** LLM output will drift, so frontmatter must not depend on it. Following OpenKB (§7), code owns the frontmatter block and the model writes body only; the validator (Phase 3) is then a check, not a crutch. This is the central design principle of the whole feature.
- **`timestamp` churn breaking no-op detection.** Addressed in §4.6.2, but needs care: naive per-run timestamping would defeat the existing snapshot optimization and cause noisy daily PRs from the scheduled workflow.
- **Entry-point duality.** `quickstart.md` (OpenWiki convention, referenced from `AGENTS.md`/`CLAUDE.md`) vs. `index.md` (OKF navigation root). Recommendation: keep both, have `index.md` link to `quickstart.md`; the `AGENTS.md`/`CLAUDE.md` reference section can continue to point at `quickstart.md`.
- **`resource` semantics.** For repo docs, the natural `resource` is a source path or a repo-relative/permalink URL. Decide a convention (e.g. `resource: /src/agent/index.ts` or a GitHub blob URL) and apply it only where a page maps to a concrete asset.
- **Dependency footprint.** Prefer an existing transitive YAML parser; if adding one, keep it minimal to honor OKF's "no required SDK" ethos.
- **Spec maturity.** OKF is a v0.1 _draft_. Pin to `0.1` via the `OKF_VERSION` constant so a future spec bump is a one-line change, and rely on OKF's forward-compatible consumption model.

---

## 9. Conclusion

OKF support is a well-scoped, backward-compatible feature for OpenWiki rather than a structural overhaul. OpenWiki already emits a cross-linked Markdown directory tree with entrypoint and incremental-update state — the OKF-native shape. The work concentrates in four places: a new opt-in flag threaded through the existing CLI/env/prompt configuration channels; an OKF output contract added to the generation prompt; a new deterministic validation/normalization module (`src/agent/okf.ts`) that guarantees conformance and generates the root `index.md` with its `okf_version` declaration; and a modest reconciliation of frontmatter/`timestamp` handling with OpenWiki's existing content-snapshot no-op logic. Following the phased plan, phases 1–3 alone deliver a spec-conformant `--okf` mode.

---

## Sources

- [OpenWiki issue #84 — Add optional Open Knowledge Format (OKF) output](https://github.com/langchain-ai/openwiki/issues/84)
- [OpenWiki repository](https://github.com/langchain-ai/openwiki) — source: `src/agent/prompt.ts`, `src/constants.ts`, `src/agent/utils.ts`, `src/env.ts`, `src/commands.ts`, `src/agent/types.ts`, `openwiki/architecture/overview.md`, `openwiki/.last-update.json`
- [OKF v0.1 specification (GoogleCloudPlatform/knowledge-catalog)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [VectifyAI/OpenKB — reference OKF producer](https://github.com/VectifyAI/OpenKB) — source: `openkb/schema.py`, `openkb/frontmatter.py`, `openkb/lint.py`, `openkb/config.py`, `openkb/indexer.py`, `skills/openkb/references/wiki-schema.md`, `examples/commands/sample-wiki/`
- [How the Open Knowledge Format can improve data sharing — Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
