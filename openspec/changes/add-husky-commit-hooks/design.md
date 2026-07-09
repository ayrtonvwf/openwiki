## Context

The project uses pnpm (Node 22 per `.nvmrc`, `engines.node >= 20`), Prettier, and ESLint (flat config in `eslint.config.js`). Package scripts already exist: `format` (`prettier --write .`), `lint` (`eslint . --fix`), and their `:check` counterparts used by CI. Quality is currently enforced by the `.claude/settings.json` Stop hook, which runs format + lint + their checks on every agent turn and exits non-zero on failure. There is no Git hook, so nothing fixes a commit before it lands, and the Claude automation commits through GitHub Actions.

## Goals / Non-Goals

**Goals:**

- A Git `pre-commit` hook that autofixes format/lint on staged files and re-stages them.
- The hook is strictly non-blocking: it always allows the commit; unfixable problems appear as warnings only.
- The hook is active for commits made inside GitHub Actions (the Claude automation), not just on developer machines.
- The agent Stop hook is reduced to running tests only.

**Non-Goals:**

- No changes to GitHub Actions CI or its `format:check` / `lint:check` / test gates.
- Not making the hook a blocking quality gate — CI remains authoritative for merge decisions.
- No change to the `eslint.config.js` rule set or Prettier config.

## Decisions

### Decision: husky v9 + lint-staged

Use `husky` (v9+) for hook management and `lint-staged` to run tools only on staged files (fast, and it re-stages files that the tools rewrite). husky v9 installs via a `prepare` script:

```jsonc
// package.json
"scripts": {
  "prepare": "husky"
},
"lint-staged": {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["prettier --write", "eslint --fix"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"]
}
```

`.husky/pre-commit`:

```sh
pnpm exec lint-staged --verbose
```

`prettier --write` and `eslint --fix` mutate files in place; lint-staged automatically re-stages files it passed to a task, so the fixes are included in the commit.

### Decision: Non-blocking via a swallow-exit wrapper + `--verbose`

lint-staged aborts a commit if any task exits non-zero, so `eslint --fix` (which exits non-zero when unfixable errors remain) would block the commit — violating the requirement. The eslint task is therefore wrapped so it always exits 0 while still printing its findings:

```jsonc
"*.{ts,tsx,js,jsx,mjs,cjs}": [
  "prettier --write",
  "bash -c 'eslint --fix \"$@\"; exit 0' --"
]
```

ESLint writes its report to stdout regardless of exit code, and running lint-staged with `--verbose` surfaces that output even when the task "succeeds", so remaining (non-autofixable) problems appear as warnings in the commit output. Prettier `--write` already exits 0 by rewriting. Net effect: the commit always completes; warnings are visible.

### Decision: Active in GitHub Actions, but CI is untouched

Hook installation happens in `prepare`, which runs during `pnpm install`. In the Claude automation environment, dependencies are installed and commits are created with `git commit`, so the hook fires and autofixes those commits. Two ways the hook could silently not fire — `HUSKY=0` in the environment, or committing with `--no-verify` — must be avoided in that environment; both are called out in tasks/verification.

CI is deliberately unaffected: CI jobs check out, install, and run `format:check` / `lint:check` / tests, but never create a commit, so the `pre-commit` hook never executes in CI. CI's `:check` scripts remain the authoritative gate — a non-autofixable problem that slips through the hook as a warning is still caught by `lint:check` on the PR.

### Decision: Stop hook keeps only tests

Because format/lint are now autofixed at commit time, keeping them in the `.claude/settings.json` Stop hook is redundant and wastes tokens and CI time. The Stop hook is reduced to running the unit tests (`pnpm test`) and surfacing failures to the agent, matching the existing pattern (write log, print on failure, `exit 2`).

## Risks / Trade-offs

- **Hook silently disabled in Actions (`HUSKY=0`) or bypassed (`--no-verify`)** → autofix would not run on automation commits. Mitigation: verification step confirms the hook fires on an Actions commit; do not set `HUSKY=0` and do not commit with `--no-verify` in that environment.
- **Non-blocking means unfixable issues can be committed** → intended trade-off; CI `lint:check` remains the authoritative gate and will fail the PR, so nothing unfixable reaches `main` unnoticed.
- **`bash` availability for the eslint wrapper** → the hook targets the pnpm/GitHub-Actions Linux/macOS environments used here, where `bash` is present; acceptable given the project's supported platforms.

## Migration Plan

Single PR: add devDependencies + `prepare` + `lint-staged` config, add `.husky/pre-commit`, trim `.claude/settings.json` to tests only. After `pnpm install`, developers get the hook automatically. No data migration; no CI changes. Reversible by removing the hook, the deps, and restoring the Stop hook.
