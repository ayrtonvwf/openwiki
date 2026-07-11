# okf-conformance Specification

## Purpose

TBD - created by archiving change okf-frontmatter-validation-index. Update Purpose after archive.

## Requirements

### Requirement: Frontmatter block parsing is line-anchored

The system SHALL detect and split a Markdown file's leading YAML frontmatter block by matching an opening `---` line at the start of the file and a closing `---` line anchored to the start of a subsequent line. The system SHALL NOT use unanchored substring search (e.g. locating the closing delimiter via a plain "find the next occurrence of `---`") to find the closing delimiter.

#### Scenario: Frontmatter value containing a literal triple-dash

- **WHEN** a page's frontmatter contains a quoted scalar value whose text includes the literal substring `---` (e.g. a `description` field describing a diff marker)
- **THEN** the parser SHALL locate the true closing delimiter as the next line consisting solely of `---`, and the body content SHALL start after that line, not partway through the quoted value

#### Scenario: File with no frontmatter block

- **WHEN** a Markdown file does not begin with a `---` line
- **THEN** the parser SHALL report an empty frontmatter map and treat the entire file content as body

### Requirement: Frontmatter scalars serialize as a strict YAML subset

The system SHALL serialize every frontmatter scalar value it writes using JSON encoding (`JSON.stringify`), producing single-line values that remain valid under standard YAML parsing.

#### Scenario: Description containing a colon

- **WHEN** a page's stamped `description` value contains a colon followed by a space (a sequence that unquoted YAML scalar rules would treat as a new mapping key)
- **THEN** the serialized frontmatter line for `description` SHALL wrap the value in a JSON-quoted string so external YAML parsers parse it as a single scalar, not a broken mapping

### Requirement: Non-reserved pages are stamped with required OKF fields

For every Markdown file under the OpenWiki output directory that is not a reserved file (`index.md`, `log.md`) and not a machine-state file, the system SHALL stamp or refresh a frontmatter block containing at minimum a non-empty `type`, a `title`, a `description`, and a `timestamp`. The system SHALL recompute the code-managed fields (`type`, `title`, `description`, `timestamp`) from the current page on every run, and SHALL preserve any other keys present in the page's prior frontmatter rather than dropping them (see the producer-added-key requirement). Serialized frontmatter SHALL use a deterministic key ordering so that re-stamping an unchanged page yields byte-for-byte identical output.

#### Scenario: Page has no frontmatter before an --okf run

- **WHEN** an `--okf` run completes and a generated page under `openwiki/architecture/overview.md` has no frontmatter block
- **THEN** the system SHALL inject a frontmatter block on that page with `type: "Architecture"` (inferred from its directory), a `title` derived from the page's first `#` heading, a `description`, and an ISO-8601 `timestamp`

#### Scenario: Page already has a stale frontmatter block

- **WHEN** an `--okf` run completes and a page already carries a frontmatter block from a prior run
- **THEN** the system SHALL recompute and overwrite `type`, `title`, and `description` from the current body content, while preserving any non-managed keys the block already contained

### Requirement: Title and description are derived deterministically

The system SHALL derive a page's `title` from its first level-one Markdown heading, falling back to a filename-derived title when no such heading exists. The system SHALL derive a page's `description` from a model-authored single-sentence summary paragraph when present, falling back to the first sentence of the page body otherwise.

#### Scenario: Page has a top-level heading

- **WHEN** a page's body begins with `# CLI Usage`
- **THEN** the stamped `title` SHALL be `"CLI Usage"`

#### Scenario: Page has no heading

- **WHEN** a page's body contains no level-one Markdown heading
- **THEN** the stamped `title` SHALL be derived from the page's filename

### Requirement: Reserved files are exempt from the type requirement

The system SHALL NOT require a `type` field on files named `index.md` or `log.md`, and SHALL NOT inject a frontmatter block into any `index.md` other than the bundle-root `openwiki/index.md`.

#### Scenario: Non-root index.md

- **WHEN** the OpenWiki output tree contains an `index.md` file in a subdirectory other than the bundle root
- **THEN** the system SHALL NOT add a frontmatter block to that file, and the validator SHALL NOT report a missing `type` on it

#### Scenario: Metadata file is untouched

- **WHEN** the pass runs over the OpenWiki output directory
- **THEN** the system SHALL NOT read, parse, or write `.last-update.json`, since it is not a Markdown file

### Requirement: Root index.md is generated deterministically

The system SHALL generate or refresh a bundle-root `index.md` file containing a frontmatter block with `okf_version: "0.1"` and a body listing each top-level documentation section using its stamped `title` and `description`, including a link to `quickstart.md`.

#### Scenario: Root index.md does not exist

- **WHEN** an `--okf` run completes and no `openwiki/index.md` file exists
- **THEN** the system SHALL create `openwiki/index.md` with frontmatter containing `okf_version: "0.1"` and a body section listing every top-level page or directory with a link to `quickstart.md`

#### Scenario: Root index.md already exists

- **WHEN** an `--okf` run completes and `openwiki/index.md` already exists from a prior run
- **THEN** the system SHALL regenerate its listing from the current set of stamped pages, overwriting stale entries for pages that were removed or renamed

### Requirement: Validation checks OKF section 9 conformance

The system SHALL validate, after stamping and repair, that every non-reserved Markdown page has a parseable frontmatter block with a non-empty `type`, and SHALL validate that `index.md` and `log.md` files (where present) satisfy their reserved-file structural rules. The system SHALL produce a structured report listing, per file, whether it passed and any specific issues found.

#### Scenario: All pages conformant

- **WHEN** every non-reserved page has a valid frontmatter block with a non-empty `type` after stamping and repair
- **THEN** the conformance report SHALL indicate an overall pass with no per-file issues

#### Scenario: A page fails validation after repair

- **WHEN** a page's frontmatter cannot be parsed even after the repair pass attempts to fix it (e.g. malformed content the parser cannot safely resolve)
- **THEN** the conformance report SHALL indicate an overall failure and SHALL include that file's path and a specific issue description

### Requirement: Missing or malformed frontmatter is safely repaired

When a non-reserved page is missing a frontmatter block, missing a `type` field, or has a frontmatter block that fails to parse, the system SHALL deterministically inject a default frontmatter block for that page as part of the same pass that performs stamping, without requiring a separate manual step.

#### Scenario: Model omitted frontmatter contrary to the prompt contract

- **WHEN** the model writes a page under `--okf` mode without following the "no frontmatter" body-only contract and the resulting page is still missing a usable frontmatter block after generation
- **THEN** the system SHALL inject a valid default frontmatter block on that page so the run's conformance check passes

### Requirement: Frontmatter timestamp is preserved within same-run idempotent reruns

The system SHALL assign a page's frontmatter `timestamp` based on whether the page's body content has genuinely changed since it was last stamped, determined by comparing a persisted hash of the page body (the content excluding the frontmatter block) against the current body. When the persisted body hash matches the current body, the system SHALL preserve the previously assigned `timestamp`; when the body has changed, or the page has no persisted body hash, the system SHALL assign the current run's ISO-8601 `timestamp`. As a migration case, when there is no persisted state for a page but the page's existing frontmatter already carries a valid `timestamp`, the system SHALL preserve that existing value (seeding persisted state from it) rather than assigning a new one. Same-run reruns with no intervening edits SHALL therefore leave every `timestamp` unchanged and rewrite no files.

#### Scenario: Rerunning the pass with no content changes

- **WHEN** the OKF pass runs twice in succession with no intervening edits to any page body
- **THEN** every page's frontmatter, including `timestamp`, SHALL resolve to the same values on both runs, and no file SHALL be rewritten on disk as a result of the second run

#### Scenario: A page body is edited between runs

- **WHEN** a page's body is edited and the OKF pass runs again after a prior stamp recorded a different body hash for that page
- **THEN** the system SHALL assign that page the current run's `timestamp`, while pages whose bodies were not edited SHALL retain their previously assigned `timestamp`

#### Scenario: Upgrading a wiki stamped before persisted state existed

- **WHEN** the OKF pass runs on a wiki whose pages were stamped by a prior version and no persisted OKF state file exists yet
- **THEN** the system SHALL preserve each page's existing frontmatter `timestamp` (seeding persisted state from it) rather than reassigning every page a new `timestamp`

### Requirement: All mutations are written atomically

The system SHALL write every file it creates or modifies during the OKF pass through an atomic write (write to a temporary path, then rename into place), so an interrupted run cannot leave a partially written Markdown file.

#### Scenario: Process is interrupted mid-write

- **WHEN** the OKF pass is writing a stamped page and the process is terminated before the write completes
- **THEN** the original file content on disk SHALL remain intact (either the old version or the fully new version), never a partially written file

### Requirement: The pass only runs when OKF output is enabled

The system SHALL invoke the OKF stamp/validate/repair/index-generation pass only when the current run's `okf` option is `true`. With `--okf` disabled, the system SHALL NOT modify, add, or remove any frontmatter or generate an `index.md`, and OpenWiki output SHALL remain byte-for-byte identical to output produced without this feature.

#### Scenario: --okf is not set

- **WHEN** an init or update run completes with `options.okf` false or absent
- **THEN** the system SHALL NOT run the OKF pass, and no frontmatter or root `index.md` SHALL be added to the output

#### Known limitation: the pass only runs alongside a detected content change

This phase invokes the OKF pass from the same branch in `runOpenWikiAgentCore` that already detects whether the current run changed any `openwiki/` content (compares a before/after content snapshot). Enabling `--okf` for the first time on an already-generated wiki, then running a command that makes no further content changes, is a true no-op at the snapshot level and SHALL NOT trigger the OKF pass — previously-unstamped pages remain unstamped until a subsequent run that does change content. A dedicated backfill pass that runs on `--okf` enablement regardless of content change is deferred to a later phase.

### Requirement: A repair-disabled conformance verification mode inspects without mutating

The system SHALL provide a conformance verification mode that inspects an existing OpenWiki bundle and produces the same structured conformance report as the generate pass (per-file pass/fail plus specific issues, and an overall pass/fail), WITHOUT stamping, repairing, generating `index.md`/`log.md`, or writing any file. In this mode the report SHALL reflect the bundle exactly as it exists on disk, so that a bundle missing frontmatter or a `type` is reported as non-conformant rather than silently repaired. This mode is the "repair disabled" path anticipated by the implementation report §4.5 and is intended for verification/CI use.

#### Scenario: Verifying a conformant bundle does not modify it

- **WHEN** conformance verification runs over a bundle whose non-reserved pages all carry a parseable frontmatter block with a non-empty `type`
- **THEN** the system SHALL report an overall pass, and SHALL NOT create, modify, or delete any file in the bundle (no stamping, no `index.md`/`log.md` generation)

#### Scenario: Verifying a non-conformant bundle reports issues without repairing

- **WHEN** conformance verification runs over a bundle containing a non-reserved page that is missing frontmatter or a non-empty `type`
- **THEN** the system SHALL report an overall failure listing that file and a specific issue, and SHALL leave the page unmodified (it SHALL NOT inject a default frontmatter block as the generate pass would)

### Requirement: Strict conformance verification signals failure via a non-zero exit code

When conformance verification runs in strict/CI mode and the bundle is non-conformant, the system SHALL cause the process to exit with a non-zero status; when the bundle is conformant, the process SHALL exit zero. The conformance outcome SHALL also be surfaced in human-readable run output so an operator sees which files failed. This makes OKF conformance gate a scheduled/CI run rather than being reported only as informational event text. The default `--okf` generate-and-repair run's exit-code behavior is unchanged by this requirement.

#### Scenario: CI run over a non-conformant bundle fails the pipeline

- **WHEN** strict conformance verification runs in a non-interactive/CI context and at least one non-reserved page is non-conformant
- **THEN** the process SHALL exit with a non-zero status code and SHALL report the failing files in its output

#### Scenario: CI run over a conformant bundle succeeds

- **WHEN** strict conformance verification runs in a non-interactive/CI context and every non-reserved page is conformant
- **THEN** the process SHALL exit with a zero status code and SHALL report an overall pass

### Requirement: Producer-added frontmatter keys are preserved across re-stamps

When re-stamping a page that already carries frontmatter, the system SHALL carry forward any keys that are not code-managed (keys other than `type`, `title`, `description`, and `timestamp`) into the newly written frontmatter block, in accordance with OKF round-trip guidance, rather than discarding them.

#### Scenario: Prior frontmatter contains a producer-added key

- **WHEN** a page's existing frontmatter contains a non-managed key (for example `resource` or a producer-specific key) and an `--okf` run re-stamps that page
- **THEN** the rewritten frontmatter SHALL still contain that key with its prior value, alongside the recomputed managed fields

### Requirement: OKF machine-state is persisted outside the conformance surface

The system SHALL persist the per-page body hashes and assigned timestamps it uses for timestamp resolution in a machine-state file under the OpenWiki output directory. This state file SHALL be excluded from the content snapshot used for no-op detection and from the Markdown traversal that stamps and validates pages, so that its presence or contents can neither trigger a run nor break the content-snapshot no-op optimization, and it SHALL never be treated as a conformance-bearing page.

#### Scenario: State file does not perturb no-op detection

- **WHEN** the content snapshot of `openwiki/` is computed before and after an OKF pass that writes or updates the machine-state file
- **THEN** the presence and contents of the machine-state file SHALL NOT be included in the snapshot, so a run whose only change would be the state file is still detected as a no-op

#### Scenario: State file is not validated as a page

- **WHEN** the OKF validation pass runs over the output directory
- **THEN** the machine-state file SHALL NOT be parsed, stamped, or reported as missing a `type`, since it is not a Markdown page

### Requirement: Change history is recorded in a reserved log.md

When an `--okf` run changes OpenWiki content, the system SHALL record the change in a bundle-root `openwiki/log.md` reserved file structured as a flat, ISO-8601 date-grouped list of change entries in newest-first order, with no frontmatter block. The system SHALL derive each entry from information available to the run (the run command and its change/git summary), SHALL append to rather than discard existing history, and SHALL NOT rewrite `log.md` on a run that appends no new entry. `log.md` SHALL remain exempt from the `type` requirement as a reserved file.

#### Scenario: A content-changing run records a log entry

- **WHEN** an `--okf` run changes OpenWiki content
- **THEN** the system SHALL prepend a dated entry describing that run to `openwiki/log.md`, preserving previously recorded entries below it in newest-first order, and SHALL NOT add a frontmatter block to `log.md`

#### Scenario: log.md is exempt from the type requirement

- **WHEN** the OKF validation pass inspects `openwiki/log.md`
- **THEN** the validator SHALL NOT report a missing `type` on it, and SHALL confirm it carries no frontmatter block as required for a reserved non-index file

### Requirement: Type is inferred from directory via the mode-selected documentation taxonomy

The system SHALL infer a page's `type` field from the top-level directory (relative to the OpenWiki output root) it resides in, using a type-to-directory taxonomy selected from the run mode. The system SHALL use the code-documentation taxonomy for `code` mode (output mode `repository`) and a personal-knowledge taxonomy for `personal` mode (output mode `local-wiki`). A page in a directory with no matching entry in the selected taxonomy SHALL still receive a non-empty `type` via that taxonomy's defined fallback value, and SHALL be recorded as a fallback classification in the conformance report. The same selected taxonomy SHALL drive both the stamped `type` and the OKF directory contract presented in the system prompt, so the prompt's advertised directories match the types the pass will infer.

#### Scenario: Code-mode page in a recognized taxonomy directory

- **WHEN** an `--okf` run in `code` mode stamps a page at `openwiki/operations/credentials-and-updates.md`
- **THEN** its stamped `type` SHALL be `"Operations"`, matching the code-documentation taxonomy that today's behavior uses

#### Scenario: Personal-mode page in a recognized taxonomy directory

- **WHEN** an `--okf` run in `personal` mode stamps a page in a directory that the personal taxonomy maps (e.g. `sources/`)
- **THEN** its stamped `type` SHALL be the personal taxonomy's type for that directory (e.g. `"Source"`), not a code-documentation type such as `"Architecture"`

#### Scenario: Page in an unrecognized directory

- **WHEN** a page lives in a directory that does not match any entry in the taxonomy selected for the current mode
- **THEN** the system SHALL stamp the selected taxonomy's non-empty fallback `type` on that page and SHALL include an entry in the conformance report noting the fallback classification

#### Scenario: Prompt contract matches the mode's taxonomy

- **WHEN** the OKF directory contract is rendered into the system prompt for a given mode
- **THEN** the advertised type→directory list SHALL be exactly the taxonomy selected for that mode, so a model following the contract places pages where directory-based `type` inference will classify them without falling back
