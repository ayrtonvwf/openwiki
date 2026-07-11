# local-quality-automation Specification

## Purpose

TBD - created by archiving change add-husky-commit-hooks. Update Purpose after archive.

## Requirements

### Requirement: Autofixing pre-commit hook

The repository SHALL install husky so that a Git `pre-commit` hook runs on every `git commit`. The hook SHALL automatically apply autofixable formatting (`prettier --write`) and lint (`eslint --fix`) changes to staged files and re-stage those files so the fixes are included in the commit. The hook SHALL be installed through the package `prepare` step so it activates on `pnpm install`.

#### Scenario: Fixable formatting issue is autofixed and committed

- **WHEN** a staged file with an autofixable formatting issue is committed
- **THEN** Prettier rewrites the file, the rewritten file is re-staged, and the commit includes the formatted content

#### Scenario: Fixable lint issue is autofixed and committed

- **WHEN** a staged JS/TS file with an autofixable lint issue is committed
- **THEN** `eslint --fix` applies the fix, the fixed file is re-staged, and the commit includes the fixed content

#### Scenario: Hook installs on dependency install

- **WHEN** `pnpm install` runs in a clone of the repository
- **THEN** the `prepare` step installs the husky hooks and the `pre-commit` hook becomes active

### Requirement: Pre-commit hook is non-blocking

The `pre-commit` hook SHALL NOT block or abort a commit. Autofixable problems SHALL be fixed automatically; non-autofixable problems SHALL be surfaced as warnings in the hook output while the commit still completes successfully (the hook exits 0). Agents or humans may act on those warnings later, or not.

#### Scenario: Non-autofixable lint error does not block the commit

- **WHEN** a staged file contains a lint error that ESLint cannot autofix
- **THEN** the hook prints the error as a warning in its output
- **AND** the commit completes successfully

#### Scenario: Clean commit completes normally

- **WHEN** the staged files have no fixable or unfixable issues
- **THEN** the hook completes and the commit proceeds without warnings

### Requirement: Hooks operate on GitHub Actions commits

The pre-commit hook SHALL be active when commits are created inside GitHub Actions, such as the Claude automation committing generated code, so autofixes are applied to those commits. The hook SHALL NOT be disabled (for example via `HUSKY=0`) or bypassed (for example via `git commit --no-verify`) in that environment.

#### Scenario: Automation commit is autofixed

- **WHEN** the Claude automation installs dependencies and then creates a commit in GitHub Actions
- **THEN** the pre-commit hook fires and applies autofixes to that commit

#### Scenario: Hook must not be silently disabled in automation

- **WHEN** the automation environment sets `HUSKY=0` or commits with `--no-verify`
- **THEN** the hook does not fire and autofixes are not applied — a failure mode this capability requires the environment to avoid

### Requirement: CI remains the authoritative, unchanged gate

The existing GitHub Actions CI checks (`format:check`, `lint:check`, and the test suite) SHALL remain the authoritative quality gate for merging and SHALL NOT be modified by this capability. Because CI never creates commits, the pre-commit hook SHALL NOT run in CI and SHALL NOT affect it.

#### Scenario: CI runs unchanged and the hook does not fire

- **WHEN** CI runs on a pull request
- **THEN** it runs `format:check`, `lint:check`, and tests as before
- **AND** the pre-commit hook does not execute during CI

#### Scenario: CI catches what the non-blocking hook let through

- **WHEN** a non-autofixable lint problem is committed as a warning and pushed in a pull request
- **THEN** CI's `lint:check` fails the pull request

### Requirement: Agent Stop hook runs only tests

The `.claude/settings.json` Stop hook SHALL run only the unit test suite (`pnpm test`) and SHALL NOT run formatting or linting, since formatting and linting are now autofixed by the Git pre-commit hook. Test failures SHALL be surfaced to the agent.

#### Scenario: Stop hook runs tests only

- **WHEN** the Claude agent finishes a turn and the Stop hook runs
- **THEN** it runs `pnpm test` and does not run `format`, `lint`, `format:check`, or `lint:check`

#### Scenario: Failing tests are surfaced to the agent

- **WHEN** the Stop hook runs `pnpm test` and a test fails
- **THEN** the failure output is surfaced to the agent
