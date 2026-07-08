## ADDED Requirements

### Requirement: Mention-based model routing

The GitHub Claude automation SHALL run on the Opus model when a triggering text contains the mention `@claude-opus`, and SHALL otherwise run on the Sonnet 5 model when a triggering text contains the mention `@claude`. The Opus path is intended for spec generation and implementation review; the Sonnet path is intended for implementation.

#### Scenario: Opus mention triggers the Opus model

- **WHEN** any triggering surface (issue comment body, review comment body, review body, issue body, or issue title) contains `@claude-opus`
- **THEN** the automation runs the Claude Code action on the Opus model

#### Scenario: Plain mention triggers the Sonnet model

- **WHEN** any triggering surface (issue comment body, review comment body, review body, issue body, or issue title) contains `@claude` but not `@claude-opus`
- **THEN** the automation runs the Claude Code action on the Sonnet 5 model

### Requirement: Mutually exclusive triggering

Because `@claude-opus` contains the substring `@claude`, the automation SHALL run exactly one model per triggering event via disjoint job trigger conditions. The Sonnet job's gate MUST exclude the `@claude-opus` mention on every triggering surface it inspects — issue comment body, pull request review comment body, pull request review body, issue body, and issue title — so that no matter which surface carries the mention, an `@claude-opus` event MUST NOT start the Sonnet job.

#### Scenario: Opus mention does not also start the Sonnet job

- **WHEN** a triggering body contains `@claude-opus`
- **THEN** the Sonnet job does not run for that event
- **AND** only the Opus job runs

#### Scenario: Exclusion applies to every trigger surface

- **WHEN** `@claude-opus` appears in any single triggering surface (issue comment body, review comment body, review body, issue body, or issue title)
- **THEN** the Sonnet job's gate excludes that event on that surface
- **AND** only the Opus job runs

### Requirement: Identical tool and toolchain configuration across both jobs

Both the Sonnet and Opus jobs SHALL use an identical tool allowlist and identical repository/toolchain setup (checkout, dependency install, local-CLI PATH). The configuration is duplicated per job by design; the two copies MUST remain identical.

#### Scenario: Both jobs carry the same tool allowlist

- **WHEN** the Sonnet and Opus jobs are compared
- **THEN** their tool allowlists are identical

#### Scenario: Both jobs share the same toolchain setup

- **WHEN** either job runs
- **THEN** it performs the same repository checkout and toolchain setup (dependency install and local-CLI PATH) as the other job

### Requirement: Preserved existing trigger events and permissions

The automation SHALL continue to trigger on the existing events (issue comments, pull request review comments, submitted pull request reviews, and opened/assigned issues) and retain the existing job permissions for whichever model path runs.

#### Scenario: Existing events still trigger automation

- **WHEN** any previously supported event fires with a valid mention
- **THEN** the corresponding model path runs with the existing permission set
