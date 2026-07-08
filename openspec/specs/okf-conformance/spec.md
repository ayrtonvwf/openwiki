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

For every Markdown file under the OpenWiki output directory that is not a reserved file (`index.md`, `log.md`) and not the metadata file, the system SHALL stamp or refresh a frontmatter block containing at minimum a non-empty `type`, a `title`, a `description`, and a `timestamp`, replacing any previous frontmatter block for that page.

#### Scenario: Page has no frontmatter before an --okf run

- **WHEN** an `--okf` run completes and a generated page under `openwiki/architecture/overview.md` has no frontmatter block
- **THEN** the system SHALL inject a frontmatter block on that page with `type: "Architecture"` (inferred from its directory), a `title` derived from the page's first `#` heading, a `description`, and an ISO-8601 `timestamp`

#### Scenario: Page already has a stale frontmatter block

- **WHEN** an `--okf` run completes and a page already carries a frontmatter block from a prior run
- **THEN** the system SHALL recompute and overwrite `type`, `title`, and `description` from the current body content rather than preserving the stale values

### Requirement: Type is inferred from directory via the repository documentation taxonomy

The system SHALL infer a page's `type` field from the top-level directory (relative to the OpenWiki output root) it resides in, using the existing type-to-directory taxonomy. A page in a directory with no matching taxonomy entry SHALL still receive a non-empty `type` via a defined fallback value, and SHALL be recorded as a fallback classification in the conformance report.

#### Scenario: Page in a recognized taxonomy directory

- **WHEN** a page lives at `openwiki/operations/credentials-and-updates.md`
- **THEN** its stamped `type` SHALL be `"Operations"`

#### Scenario: Page in an unrecognized directory

- **WHEN** a page lives in a directory that does not match any taxonomy entry
- **THEN** the system SHALL stamp a non-empty fallback `type` on that page and SHALL include an entry in the conformance report noting the fallback classification

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

The system SHALL preserve a page's existing `timestamp` value whenever a valid prior `timestamp` is already present in that page's frontmatter, and SHALL only assign a new `timestamp` when no valid prior value exists. This phase scopes the rule to same-run idempotence (a rerun with no intervening edits must not change any `timestamp`); detecting a genuine cross-run body edit and assigning a fresh `timestamp` for it requires persisting a body-content hash across runs, which is deferred to Phase 4 (see design.md's Non-Goals).

#### Scenario: Rerunning the pass with no content changes

- **WHEN** the OKF pass runs twice in succession with no intervening edits to any page body
- **THEN** every page's frontmatter, including `timestamp`, SHALL resolve to the same values on both runs, and no file SHALL be rewritten on disk as a result of the second run

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

