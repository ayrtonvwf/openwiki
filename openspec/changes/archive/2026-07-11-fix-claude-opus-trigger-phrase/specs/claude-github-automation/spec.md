## ADDED Requirements

### Requirement: Action-level trigger phrase configuration

`anthropics/claude-code-action@v1` performs its own trigger-phrase check on the triggering comment/issue/review body, independent of and in addition to the job-level `if:` gate. The check defaults to `@claude` and matches on word boundaries, so it does not match `@claude-opus`. Each job SHALL set the action's `trigger_phrase` input explicitly to the mention keyword that job targets, so the action does not silently no-op after a matching job `if:` gate has already run.

#### Scenario: Sonnet job sets its trigger phrase explicitly

- **WHEN** the Sonnet job's `claude-code-action` step runs
- **THEN** its `trigger_phrase` input is set to `@claude`

#### Scenario: Opus job sets its trigger phrase explicitly

- **WHEN** the Opus job's `claude-code-action` step runs
- **THEN** its `trigger_phrase` input is set to `@claude-opus`

#### Scenario: Mismatched trigger phrase causes a silent no-op

- **WHEN** a job's `if:` gate matches an event but the action's `trigger_phrase` does not match the same triggering text
- **THEN** the action completes without error but performs no work, having found no matching trigger

### Requirement: Model selection via claude_args

`anthropics/claude-code-action@v1` has no top-level `model` input. Passing `model` as a step input SHALL NOT select the model — the action ignores it (surfacing only a build warning) and runs its default model instead. Each job SHALL select its model by passing `--model <model-id>` inside the `claude_args` input.

#### Scenario: Model passed via claude_args is honored

- **WHEN** a job's `claude_args` includes `--model <model-id>`
- **THEN** the action runs using that model

#### Scenario: Top-level model input is silently ignored

- **WHEN** a job passes `model: <model-id>` as a step input instead of inside `claude_args`
- **THEN** the action logs an "Unexpected input(s) 'model'" warning and runs its default model, not the intended one
