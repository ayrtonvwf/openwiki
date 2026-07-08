## Why

The `@claude` GitHub automation runs a single model (Sonnet 5) for every task. Spec generation and implementation review benefit from a stronger model (Opus), but implementation work is well served by Sonnet. There is currently no way to choose the model per invocation, so higher-reasoning tasks either run on Sonnet or require manual, out-of-band handling.

## What Changes

- Add a second mention trigger, `@claude-opus`, that runs the Claude Code action on Opus, intended for spec generation and implementation review.
- Keep the existing `@claude` trigger running on Sonnet 5 for implementation, with its current behavior unchanged.
- Implement as two separate, independently-scoped jobs (a Sonnet job and an Opus job), each with its own identical copy of the tool allowlist and toolchain setup — accepting a small duplicated allowlist in exchange for simpler jobs that can diverge later.
- Ensure the two triggers do not both fire on a comment that contains `@claude-opus` (which also contains the substring `@claude`).

## Capabilities

### New Capabilities

- `claude-github-automation`: The GitHub-Actions-triggered Claude Code agent — which mention keywords trigger it, which model each keyword runs, and the shared toolchain/permission configuration applied to every run.

### Modified Capabilities

<!-- None: no existing spec covers this workflow. -->

## Impact

- `.github/workflows/claude.yml`: adds a second `claude-opus` job (Opus model) alongside the existing Sonnet job, each with its own copy of the tool allowlist and repo/toolchain setup steps; the Sonnet job's trigger gate is tightened to exclude `@claude-opus`.
- No application code, APIs, or dependencies change. Cost impact is opt-in: Opus only runs when `@claude-opus` is used explicitly.
