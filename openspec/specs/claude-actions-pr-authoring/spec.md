# claude-actions-pr-authoring Specification

## Purpose

Defines what the Claude GitHub Actions workflow (`.github/workflows/claude.yml`) is permitted to do with the `gh` CLI when responding to `@claude`/`@claude-opus` mentions, including opening pull requests.

## Requirements

### Requirement: Claude Actions jobs can open pull requests via gh CLI

The Claude GitHub Actions workflow SHALL permit both the `claude` and `claude-opus` jobs to open pull requests using the `gh pr create` command without triggering an interactive approval prompt. The permission MUST be granted through the `--allowedTools` allowlist passed to `anthropics/claude-code-action`, and the two jobs' allowlists MUST remain identical.

#### Scenario: Claude opens a PR after pushing a branch

- **WHEN** a user tags `@claude` or `@claude-opus` on an issue requesting a change and Claude has pushed a branch with its work
- **THEN** Claude can run `gh pr create` to open a pull request without being blocked by a tool-approval prompt

#### Scenario: Both jobs share the same allowlist

- **WHEN** the allowlist for one Claude job is changed to include `gh pr create`
- **THEN** the other Claude job's allowlist is updated to match, keeping the two identical

#### Scenario: No new workflow permissions required

- **WHEN** the `gh pr create` allowance is added
- **THEN** the jobs rely on the already-declared `pull-requests: write` permission and no additional workflow-level permissions are introduced
