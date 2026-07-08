## Why

When Claude runs in GitHub Actions (`.github/workflows/claude.yml`) it can edit, comment on, and view PRs, but its allowlist has no `gh pr create`, so it cannot open a pull request from scratch. When someone tags `@claude`/`@claude-opus` on an issue asking for a fix, Claude can push a branch but then hits an approval prompt it cannot answer in CI, leaving the work stranded without a PR.

## What Changes

- Grant the Claude GitHub Actions jobs permission to open pull requests via the `gh` CLI by adding `Bash(gh pr create:*)` to the `--allowedTools` allowlist in both the `claude` and `claude-opus` jobs.
- Keep the two job allowlists identical, as the existing in-file convention requires.
- The `pull-requests: write` permission both jobs already declare is sufficient for `gh pr create`; no new workflow permissions are needed.

## Capabilities

### New Capabilities

- `claude-actions-pr-authoring`: Defines what the Claude GitHub Actions workflow is permitted to do with the `gh` CLI when responding to mentions, including opening pull requests.

### Modified Capabilities

<!-- None: no existing openspec spec governs the CI workflow allowlist. -->

## Impact

- `.github/workflows/claude.yml` — `--allowedTools` in both the `claude` and `claude-opus` `Run Claude Code` steps.
- No application source, dependencies, or runtime behavior of the `openwiki` CLI is affected.
