## RENAMED Requirements

- FROM: `### Requirement: Type is inferred from directory via the repository documentation taxonomy`
- TO: `### Requirement: Type is inferred from directory via the mode-selected documentation taxonomy`

## MODIFIED Requirements

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
