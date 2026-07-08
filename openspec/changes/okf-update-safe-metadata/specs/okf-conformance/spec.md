## MODIFIED Requirements

### Requirement: Non-reserved pages are stamped with required OKF fields

For every Markdown file under the OpenWiki output directory that is not a reserved file (`index.md`, `log.md`) and not a machine-state file, the system SHALL stamp or refresh a frontmatter block containing at minimum a non-empty `type`, a `title`, a `description`, and a `timestamp`. The system SHALL recompute the code-managed fields (`type`, `title`, `description`, `timestamp`) from the current page on every run, and SHALL preserve any other keys present in the page's prior frontmatter rather than dropping them (see the producer-added-key requirement). Serialized frontmatter SHALL use a deterministic key ordering so that re-stamping an unchanged page yields byte-for-byte identical output.

#### Scenario: Page has no frontmatter before an --okf run

- **WHEN** an `--okf` run completes and a generated page under `openwiki/architecture/overview.md` has no frontmatter block
- **THEN** the system SHALL inject a frontmatter block on that page with `type: "Architecture"` (inferred from its directory), a `title` derived from the page's first `#` heading, a `description`, and an ISO-8601 `timestamp`

#### Scenario: Page already has a stale frontmatter block

- **WHEN** an `--okf` run completes and a page already carries a frontmatter block from a prior run
- **THEN** the system SHALL recompute and overwrite `type`, `title`, and `description` from the current body content, while preserving any non-managed keys the block already contained

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

## ADDED Requirements

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
