## 1. Sonnet job (existing)

- [x] 1.1 Rename/keep the existing job as the Sonnet job and tighten its `if:` gate to require `@claude` **and not** `@claude-opus` across all four event bodies (`comment.body`, `review.body`, `issue.body`, `issue.title`).
- [x] 1.2 Pin its model explicitly to Sonnet 5 (`claude-sonnet-5`) via the action's `model` input or `--model`, keeping its current `--allowedTools` allowlist and setup steps unchanged.

## 2. Opus job (new)

- [x] 2.1 Add a second job `claude-opus` with an `if:` gate that fires when the triggering body contains `@claude-opus` across all four event bodies, and the same `runs-on`/`permissions` as the Sonnet job.
- [x] 2.2 Duplicate the checkout, pnpm setup, install, and local-CLI PATH steps into the Opus job.
- [x] 2.3 Run `anthropics/claude-code-action@v1` in the Opus job with model `claude-opus-4-8` and an identical copy of the Sonnet job's `--allowedTools` allowlist.

## 3. Keep the duplicate honest

- [x] 3.1 Add a short comment on each job's allowlist noting it is mirrored in the other job and must be kept identical.

## 4. Validation

- [ ] 4.1 Trigger `@claude-opus` on a test issue/PR and confirm only the Opus job runs and its logs report the Opus model.
- [ ] 4.2 Trigger `@claude` and confirm only the Sonnet job runs and reports Sonnet 5, with existing events and permissions unchanged.
