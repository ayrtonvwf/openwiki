## Context

`.github/workflows/claude.yml` defines two jobs (`claude` and `claude-opus`) that run `anthropics/claude-code-action@v1` when someone mentions `@claude`/`@claude-opus`. Both jobs already declare `pull-requests: write` permission and pass an identical `--allowedTools` allowlist. The allowlist currently includes `gh pr edit`, `gh pr comment`, and `gh pr view` but not `gh pr create`, so Claude cannot open a new PR non-interactively. In CI there is no human to approve a tool prompt, so any attempt to create a PR stalls.

## Goals / Non-Goals

**Goals:**

- Let both Claude jobs run `gh pr create` without an approval prompt.
- Preserve the existing "both allowlists identical" invariant documented in the file.

**Non-Goals:**

- Changing which models run, the mention-gating logic, or workflow permissions.
- Broadening `gh` access beyond PR creation (no `gh pr merge`, `gh api`, etc.).
- Touching the scheduled `openwiki-update.yml` workflow, which uses `peter-evans/create-pull-request` and is unrelated.

## Decisions

- **Add `Bash(gh pr create:*)` to the allowlist in both jobs.** The `:*` prefix form matches both the bare command and any argument variation, consistent with every other entry in the allowlist. Placing it alongside the existing `gh pr edit/comment/view` entries keeps related `gh pr` verbs grouped.
  - _Alternative considered:_ granting broad `Bash(gh:*)` — rejected as over-permissive; the file deliberately scopes each `gh` verb.
- **Rely on existing `pull-requests: write`.** `gh pr create` needs write access to pull requests, which both jobs already have via the `GITHUB_TOKEN`; no permission block change is required.

## Risks / Trade-offs

- [Allowlists drift out of sync] → The file already carries a "keep both allowlists identical" note; apply the same edit to both jobs and rely on review to catch divergence.
- [Claude opens unwanted PRs] → Scope is limited to `gh pr create`; the workflow only runs on explicit `@claude` mentions, so PR creation stays intentional.
