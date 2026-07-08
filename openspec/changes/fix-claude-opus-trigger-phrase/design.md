## Context

`add-claude-opus-trigger` added a `claude-opus` job with a job-level `if:` gate and a top-level `model: claude-opus-4-8` input, on the (incorrect) assumption that the job `if:` gate was the only trigger check and that `model:` was a valid action input. In production, `anthropics/claude-code-action@v1` re-checks the triggering text against its own `trigger_phrase` (default `@claude`, word-boundary match) and has no `model:` input at all. Both jobs were already corrected directly in `.github/workflows/claude.yml`; this change brings the spec up to date with that fix.

## Goals / Non-Goals

**Goals:**

- Spec captures the action's internal `trigger_phrase` check as part of the routing contract.
- Spec captures that model selection happens via `--model` inside `claude_args`, not a top-level input.

**Non-Goals:**

- No further workflow changes — `.github/workflows/claude.yml` already reflects the fix.
- No change to job `if:` gates, permissions, or the shared allowlist.

## Decisions

### Decision: Document as ADDED requirements, not MODIFIED

The existing "Mention-based model routing" requirement described the desired _outcome_ correctly; it just omitted the action-internal mechanism needed to achieve it. Adding two new requirements (trigger phrase, model-via-claude_args) is more precise than rewriting the existing requirement, and avoids losing its original scenarios.

## Risks / Trade-offs

- **Spec/implementation could drift again if the action's input surface changes in a future major version** → Mitigation: the new requirements name the exact mechanism (`trigger_phrase`, `claude_args`), making a future action-version bump easy to diff against.

## Migration Plan

- Spec-only change; `.github/workflows/claude.yml` was already updated and merged. Archive this change immediately after review since implementation already exists.
