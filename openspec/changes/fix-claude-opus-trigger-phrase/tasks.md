## 1. Workflow (already applied)

- [x] 1.1 Set `trigger_phrase: "@claude"` on the Sonnet job's `claude-code-action` step.
- [x] 1.2 Set `trigger_phrase: "@claude-opus"` on the Opus job's `claude-code-action` step.
- [x] 1.3 Move `model: claude-sonnet-5` / `model: claude-opus-4-8` out of the top-level step input and into `claude_args` as `--model claude-sonnet-5` / `--model claude-opus-4-8`.

## 2. Verification

- [ ] 2.1 On `main`, mention `@claude-opus` on an issue/PR and confirm the run log shows a matched trigger and Opus-model activity (not a same-second no-op).
- [ ] 2.2 Confirm `@claude` still runs Sonnet 5 with a matched trigger.
