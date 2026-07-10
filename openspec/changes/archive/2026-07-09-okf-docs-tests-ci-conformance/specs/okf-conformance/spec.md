## ADDED Requirements

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
