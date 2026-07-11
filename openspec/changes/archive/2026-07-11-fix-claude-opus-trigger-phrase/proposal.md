## Why

After `add-claude-opus-trigger` shipped, `@claude-opus` mentions triggered the `claude-opus` job (routing worked) but `anthropics/claude-code-action@v1` silently no-op'd: the action performs its own trigger-phrase check on the comment body, independent of the job `if:` gate, defaulting to `@claude` with word-boundary matching — which does not match `@claude-opus`. Separately, the action has no `model:` input; passing `model: claude-opus-4-8` at the top level produced only a build warning and silently ran the default model. The spec never captured either mechanism, so the gap wasn't caught in review.

## What Changes

- Document the action's internal `trigger_phrase` check as part of the routing contract: each job MUST set `trigger_phrase` to the mention keyword it targets (`@claude` for Sonnet, `@claude-opus` for Opus), not rely solely on the job-level `if:` gate.
- Document that the model MUST be passed via `--model` inside `claude_args`, since the action has no top-level `model:` input.
- No behavior change beyond what was already fixed directly in `.github/workflows/claude.yml`: this change brings the spec in line with the corrected, already-deployed workflow.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `claude-github-automation`: adds the action-level `trigger_phrase` requirement and the `claude_args`-based model-passing requirement, both omitted from the original spec.

## Impact

- `openspec/specs/claude-github-automation/spec.md`: two requirements added/clarified.
- `.github/workflows/claude.yml`: already corrected (both jobs set `trigger_phrase` and pass `--model` via `claude_args`); this change only updates the spec to match.
