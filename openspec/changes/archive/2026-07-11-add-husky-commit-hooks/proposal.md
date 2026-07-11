## Why

Formatting and linting are currently enforced two ways that both cost time and tokens: the `.claude/settings.json` Stop hook runs `format`, `lint`, `format:check`, and `lint:check` on every agent turn (and blocks the turn on failure), and there is nothing that fixes a human contributor's commit before it lands. There is no Git-level automation, so unformatted or unlinted code can be committed locally and only caught later in CI.

We want a single, cheap, local mechanism: a Git `pre-commit` hook that autofixes what it can and warns about the rest — never blocking the commit — so both humans and the Claude automation (which commits through GitHub Actions) land already-fixed code. With that in place, format/lint no longer need to run in the agent Stop hook, saving tokens and GitHub Actions time.

## What Changes

- Install **husky** and **lint-staged** and register a non-blocking `pre-commit` hook that runs `prettier --write` and `eslint --fix` on staged files, re-staging the fixed files so the fixes are part of the commit.
- The hook **never blocks a commit**: autofixable problems are fixed automatically; non-autofixable problems are printed as warnings in the hook output and the commit still completes. Agents may pick up those warnings and fix them later, or not.
- Ensure the hook is active for commits created inside GitHub Actions (the Claude automation), via the package `prepare` step, and not disabled/bypassed there.
- Leave the existing GitHub Actions CI (`format:check`, `lint:check`, tests) untouched — it remains the authoritative gate. CI never creates commits, so the pre-commit hook never runs in CI and cannot affect it.
- Remove `format` and `lint` from the `.claude/settings.json` Stop hook, leaving only the unit test suite (`pnpm test`) for the agent to see.

## Capabilities

### New Capabilities

- `local-quality-automation`: defines where and how formatting, linting, and testing run locally — a non-blocking autofixing Git `pre-commit` hook for format/lint, and a Claude Stop hook scoped to tests only.

### Modified Capabilities

<!-- None -->

## Impact

- `package.json`: add `husky` and `lint-staged` devDependencies, a `prepare` script, and a `lint-staged` config; `pnpm-lock.yaml` updated.
- `.husky/pre-commit`: new hook script (runs `lint-staged`).
- `.claude/settings.json`: Stop hook reduced to running `pnpm test` only.
- No changes to `.github/workflows/*` — CI is deliberately left unaffected.
