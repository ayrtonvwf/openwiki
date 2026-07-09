## 1. Install and register husky + lint-staged

- [x] 1.1 Add `husky` (v9+) and `lint-staged` as devDependencies (`pnpm add -D husky lint-staged`), updating `pnpm-lock.yaml`.
- [x] 1.2 Add a `"prepare": "husky"` script to `package.json` so hooks install on `pnpm install`.
- [x] 1.3 Add a `lint-staged` config to `package.json`: `prettier --write` for supported file types, and `eslint --fix` for JS/TS files.

## 2. Non-blocking autofixing pre-commit hook

- [ ] 2.1 Create `.husky/pre-commit` that runs `pnpm exec lint-staged --verbose`.
- [ ] 2.2 Wrap the `eslint --fix` lint-staged task so it always exits 0 (e.g. `bash -c 'eslint --fix "$@"; exit 0' --`), so unfixable lint errors never abort the commit.
- [ ] 2.3 Confirm lint-staged re-stages files rewritten by prettier/eslint so fixes land in the commit.

## 3. Ensure hooks fire for GitHub Actions commits

- [ ] 3.1 Verify `prepare` runs during dependency install in the Claude automation environment so `.husky` hooks are active.
- [ ] 3.2 Verify commits in that environment are not created with `--no-verify` and that `HUSKY=0` is not set, so the hook fires and autofixes automation commits.

## 4. Reduce the agent Stop hook to tests only

- [ ] 4.1 In `.claude/settings.json`, replace the Stop hook command so it runs only `pnpm test` (keeping the existing log-to-file, print-on-failure, `exit 2` pattern) and no longer runs `format`, `lint`, `format:check`, or `lint:check`.

## 5. Verification

- [ ] 5.1 Commit a file with a fixable formatting issue → prettier rewrites it, it is re-staged, and the commit includes the fixed content.
- [ ] 5.2 Commit a file with a non-autofixable lint error → the hook prints it as a warning and the commit still completes (exit 0).
- [ ] 5.3 Confirm CI (`format:check`, `lint:check`, tests) is unchanged and still fails a PR that contains a non-autofixable problem.
- [ ] 5.4 Confirm an automation commit made in GitHub Actions has the pre-commit hook applied (autofix present in the resulting commit).
