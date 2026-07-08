## 1. Update the Claude workflow allowlist

- [x] 1.1 In `.github/workflows/claude.yml`, add `Bash(gh pr create:*)` to the `--allowedTools` list in the `claude` job's "Run Claude Code" step, grouped with the existing `gh pr edit/comment/view` entries
- [x] 1.2 Apply the identical change to the `claude-opus` job's `--allowedTools` list so both allowlists remain identical

## 2. Verify

- [x] 2.1 Confirm both jobs' allowlists match exactly and include `Bash(gh pr create:*)`
- [x] 2.2 Confirm no workflow `permissions` block was changed (both jobs still declare `pull-requests: write`)
