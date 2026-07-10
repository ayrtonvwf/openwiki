import { describe, expect, test } from "vitest";
import { createSystemPrompt } from "../src/agent/prompt.ts";
import { CODE_DOC_TYPES, PERSONAL_DOC_TYPES } from "../src/constants.ts";

describe("createSystemPrompt", () => {
  const commands = ["chat", "init", "update"] as const;

  for (const command of commands) {
    test(`(${command}) omits the OKF contract by default`, () => {
      const prompt = createSystemPrompt(command);

      expect(prompt).not.toContain("OKF output contract");
    });

    test(`(${command}) omits the OKF contract when okf is false`, () => {
      const prompt = createSystemPrompt(command, { okf: false });

      expect(prompt).not.toContain("OKF output contract");
    });

    test(`(${command}) is byte-for-byte identical with and without an explicit okf:false`, () => {
      expect(createSystemPrompt(command)).toBe(
        createSystemPrompt(command, { okf: false }),
      );
    });

    test(`(${command}) appends the OKF contract when okf is true`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      expect(prompt).toContain("OKF output contract");
    });

    test(`(${command}) OKF contract instructs body-only, no-frontmatter output`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      expect(prompt).toMatch(/body content only/i);
      expect(prompt).toMatch(/never emit a yaml frontmatter block/i);
    });

    test(`(${command}) OKF contract requires bundle-relative absolute links`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      expect(prompt).toMatch(/bundle-relative absolute links/i);
      expect(prompt).toContain("/architecture/overview.md");
    });

    test(`(${command}) OKF contract requires a Citations section`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      expect(prompt).toContain("# Citations");
    });

    test(`(${command}) OKF contract lists every taxonomy entry for the default (local-wiki) mode`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      for (const type of Object.keys(PERSONAL_DOC_TYPES.types)) {
        expect(prompt).toContain(type);
      }
    });

    test(`(${command}) OKF contract lists every taxonomy entry for repository mode`, () => {
      const prompt = createSystemPrompt(command, {
        okf: true,
        outputMode: "repository",
      });

      for (const type of Object.keys(CODE_DOC_TYPES.types)) {
        expect(prompt).toContain(type);
      }
    });

    test(`(${command}) personal-mode OKF contract lists personal types, not code-only types`, () => {
      const prompt = createSystemPrompt(command, {
        okf: true,
        outputMode: "local-wiki",
      });

      expect(prompt).toContain("Source");
      expect(prompt).toContain("Topic");
      expect(prompt).not.toContain("Architecture");
      expect(prompt).not.toContain("Data Model");
    });

    test(`(${command}) OKF contract allows index.md alongside quickstart.md`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      expect(prompt).toMatch(/index\.md/);
      expect(prompt).toMatch(/quickstart\.md remains required/i);
    });

    test(`(${command}) OKF contract preserves existing frontmatter on edits`, () => {
      const prompt = createSystemPrompt(command, { okf: true });

      expect(prompt).toMatch(/never drop, rewrite, or reformat that block/i);
    });
  }
});
