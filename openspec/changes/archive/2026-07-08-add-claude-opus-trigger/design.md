## Context

`.github/workflows/claude.yml` today has one job that triggers on `@claude` across four event types, runs `anthropics/claude-code-action@v1` with the default model (Sonnet 5), and passes a single `--allowedTools` allowlist plus repo/toolchain setup steps (pnpm install, local-CLI PATH). We want a second keyword, `@claude-opus`, that runs the same action on Opus with the identical tools, while keeping `@claude` on Sonnet. The requester has chosen **two separate, independently-scoped jobs**, accepting a small duplicated allowlist in exchange for simpler jobs that can later diverge (e.g. narrower Opus permissions) without untangling shared routing logic.

## Goals / Non-Goals

**Goals:**

- `@claude-opus` runs on Opus; `@claude` (without `-opus`) runs on Sonnet 5.
- Exactly one model runs per event, despite `@claude-opus` containing the substring `@claude`.
- Both jobs use an identical tool allowlist and identical toolchain setup, kept in sync by convention.
- No change to existing trigger events or job permissions.

**Non-Goals:**

- Per-model tool scoping (Opus review getting narrower permissions) — deferred; both jobs carry the same allowlist for now, but the two-job structure is what makes divergence cheap later.
- Multi-phase spec→implement→review pipeline automation.
- Changing the model aliases vs. pinned-ID policy beyond what this change needs.

## Decisions

### Decision: Two separate jobs, one per model

Split `claude.yml` into two jobs — `claude` (Sonnet 5) and `claude-opus` (Opus) — each with its own `if:` gate, its own `--model`, and its own copy of the checkout/pnpm/install/PATH setup and the `--allowedTools` allowlist.

- **Why:** Each job stays simple and self-contained: read top to bottom, one model, one gate, no runtime model-selection step. The two jobs can later diverge (e.g. a read-mostly allowlist for the Opus review job) by editing one job in isolation. The cost is a duplicated allowlist string that must be kept identical by hand — accepted by the requester.
- **Alternative considered:** One job that derives the model from the triggering body via a selection step. Rejected by the requester: keeps the allowlist in one place but adds routing plumbing (body parsing across four event shapes, a job output) and couples both models to one permission set.
- **Alternative considered:** A reusable composite/`workflow_call` to share setup across the two jobs. Rejected as over-engineered for a single workflow file today.
- **Keeping the duplicate in sync:** A short comment on each allowlist noting it is mirrored in the other job; this is the tradeoff the two-job structure buys.

### Decision: Mutual exclusivity via job `if:` gates

The two job gates are made disjoint so exactly one job runs per event:

- **Opus job** runs when the triggering body contains `@claude-opus`.
- **Sonnet job** runs when the triggering body contains `@claude` **and not** `@claude-opus`.

Because `@claude-opus` contains the substring `@claude`, the Sonnet gate must explicitly exclude `@claude-opus` (via `!contains(..., '@claude-opus')`) so an Opus mention does not also start a Sonnet run. Each gate spans all four event shapes (`github.event.comment.body`, `github.event.review.body`, `github.event.issue.body`, `github.event.issue.title`), mirroring today's condition.

### Decision: Model identifier

Use the action's model input with an explicit value. Prefer pinned exact IDs (`claude-opus-4-8`, `claude-sonnet-5`) for reproducibility of an unattended CI agent; the alias form (`opus`/`sonnet`) is acceptable if the team prefers auto-tracking latest. This is a one-line value and can be revisited without structural change.

## Risks / Trade-offs

- **Duplicated allowlist can drift** → Mitigation: a mirrored-in-other-job comment on each; the allowlist is a single contiguous string, easy to diff/copy. Accepted tradeoff.
- **Sonnet gate must exclude `@claude-opus`** → If the exclusion is forgotten, an `@claude-opus` mention starts both jobs (double run, double cost). Mitigation: the negative `!contains(..., '@claude-opus')` clause is required across all four event shapes and is covered by the validation task.
- **Pinned model IDs can age** → Mitigation: IDs are a single, obvious value to bump; documented in the workflow comment.

## Migration Plan

- Edit `.github/workflows/claude.yml` in place; no data migration. Rollback is reverting the file.
- Validate by mentioning `@claude-opus` on a test issue/PR and confirming the run logs report the Opus model, and `@claude` still reports Sonnet.

## Open Questions

- Pinned IDs vs. aliases — confirm team preference (defaulting to pinned IDs unless told otherwise).
