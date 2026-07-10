import { describe, expect, test } from "vitest";
import {
  CODE_DOC_TYPES,
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_RETRY_ATTEMPTS,
  DEFAULT_PROVIDER,
  getDefaultModelId,
  getDocTypeForDirectory,
  getTaxonomyForMode,
  isValidBaseUrl,
  isValidModelId,
  isValidProvider,
  normalizeModelId,
  normalizeProvider,
  PERSONAL_DOC_TYPES,
  resolveConfiguredProvider,
  resolveOkfEnabled,
  resolveProviderBaseUrl,
  resolveProviderRetryAttempts,
} from "../src/constants.ts";

describe("isValidModelId", () => {
  test("accepts normal provider/model ids", () => {
    expect(isValidModelId("claude-opus-4-8")).toBe(true);
    expect(isValidModelId("z-ai/glm-5.2")).toBe(true);
    expect(isValidModelId("accounts/fireworks/models/glm-5p2")).toBe(true);
    expect(isValidModelId("gpt-5.4-mini")).toBe(true);
  });

  test("rejects empty, whitespace-only, and over-long ids", () => {
    expect(isValidModelId("")).toBe(false);
    expect(isValidModelId("   ")).toBe(false);
    expect(isValidModelId("a".repeat(121))).toBe(false);
    expect(isValidModelId("a".repeat(120))).toBe(true);
  });

  test("rejects ids containing a scheme (://)", () => {
    expect(isValidModelId("http://evil.example/model")).toBe(false);
  });

  test("rejects ids starting with a non-alphanumeric character", () => {
    expect(isValidModelId("-leading-dash")).toBe(false);
    expect(isValidModelId("/leading-slash")).toBe(false);
  });

  test("normalizeModelId trims surrounding whitespace", () => {
    expect(normalizeModelId("  claude-opus-4-8  ")).toBe("claude-opus-4-8");
  });
});

describe("normalizeProvider / isValidProvider", () => {
  test("normalizes case and whitespace to a known provider", () => {
    expect(normalizeProvider("  Anthropic ")).toBe("anthropic");
    expect(normalizeProvider("OPENROUTER")).toBe("openrouter");
  });

  test("returns null for unknown or nullish providers", () => {
    expect(normalizeProvider("bogus")).toBeNull();
    expect(normalizeProvider(null)).toBeNull();
    expect(normalizeProvider(undefined)).toBeNull();
  });

  test("isValidProvider is a type guard over the known set", () => {
    expect(isValidProvider("anthropic")).toBe(true);
    expect(isValidProvider("openai-compatible")).toBe(true);
    expect(isValidProvider("nope")).toBe(false);
  });
});

describe("resolveConfiguredProvider", () => {
  test("honors an explicit OPENWIKI_PROVIDER", () => {
    expect(resolveConfiguredProvider({ OPENWIKI_PROVIDER: "anthropic" })).toBe(
      "anthropic",
    );
  });

  test("falls back to openrouter when only an OpenRouter key is present", () => {
    expect(resolveConfiguredProvider({ OPENROUTER_API_KEY: "x" })).toBe(
      "openrouter",
    );
  });

  test("falls back to the default provider when nothing is configured", () => {
    expect(resolveConfiguredProvider({})).toBe(DEFAULT_PROVIDER);
  });

  test("ignores an invalid OPENWIKI_PROVIDER value", () => {
    expect(resolveConfiguredProvider({ OPENWIKI_PROVIDER: "bogus" })).toBe(
      DEFAULT_PROVIDER,
    );
  });
});

describe("resolveOkfEnabled", () => {
  test("defaults to false when unset", () => {
    expect(resolveOkfEnabled({})).toBe(false);
  });

  test("accepts truthy values '1' and 'true' (case-insensitive)", () => {
    expect(resolveOkfEnabled({ OPENWIKI_OKF: "1" })).toBe(true);
    expect(resolveOkfEnabled({ OPENWIKI_OKF: "true" })).toBe(true);
    expect(resolveOkfEnabled({ OPENWIKI_OKF: "TRUE" })).toBe(true);
    expect(resolveOkfEnabled({ OPENWIKI_OKF: " true " })).toBe(true);
  });

  test("treats any other value as false", () => {
    expect(resolveOkfEnabled({ OPENWIKI_OKF: "0" })).toBe(false);
    expect(resolveOkfEnabled({ OPENWIKI_OKF: "false" })).toBe(false);
    expect(resolveOkfEnabled({ OPENWIKI_OKF: "yes" })).toBe(false);
  });
});

describe("resolveProviderBaseUrl", () => {
  test("returns the built-in default when no override is set", () => {
    expect(resolveProviderBaseUrl("openrouter", {})).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  test("prefers a non-empty env override over the default", () => {
    expect(
      resolveProviderBaseUrl("anthropic", {
        ANTHROPIC_BASE_URL: "https://gateway.example/anthropic",
      }),
    ).toBe("https://gateway.example/anthropic");
  });

  test("ignores a whitespace-only override", () => {
    // anthropic has no built-in default, so a blank override resolves to undefined.
    expect(
      resolveProviderBaseUrl("anthropic", { ANTHROPIC_BASE_URL: "   " }),
    ).toBeUndefined();
  });

  test("returns undefined for a provider with no default and no override", () => {
    expect(resolveProviderBaseUrl("openai", {})).toBeUndefined();
  });
});

describe("resolveProviderRetryAttempts", () => {
  test("uses the OpenWiki default when no override is set", () => {
    expect(resolveProviderRetryAttempts({})).toBe(
      DEFAULT_PROVIDER_RETRY_ATTEMPTS,
    );
  });

  test("accepts positive integer retry counts", () => {
    expect(
      resolveProviderRetryAttempts({
        OPENWIKI_PROVIDER_RETRY_ATTEMPTS: "1",
      }),
    ).toBe(1);
    expect(
      resolveProviderRetryAttempts({
        OPENWIKI_PROVIDER_RETRY_ATTEMPTS: " 3 ",
      }),
    ).toBe(3);
  });

  test("rejects invalid retry counts", () => {
    for (const value of ["", "   ", "0", "-1", "1.5", "abc", "1e2"]) {
      expect(() =>
        resolveProviderRetryAttempts({
          OPENWIKI_PROVIDER_RETRY_ATTEMPTS: value,
        }),
      ).toThrow(/OPENWIKI_PROVIDER_RETRY_ATTEMPTS/u);
    }
  });
});

describe("isValidBaseUrl", () => {
  test("accepts http and https URLs", () => {
    expect(isValidBaseUrl("https://api.example.com/v1")).toBe(true);
    expect(isValidBaseUrl("http://localhost:8080")).toBe(true);
  });

  test("rejects blank, non-URL, and non-http(s) schemes", () => {
    expect(isValidBaseUrl("")).toBe(false);
    expect(isValidBaseUrl("   ")).toBe(false);
    expect(isValidBaseUrl("not a url")).toBe(false);
    expect(isValidBaseUrl("ftp://example.com")).toBe(false);
  });
});

describe("CODE_DOC_TYPES", () => {
  test("is a single exported constant mapping each type to a directory", () => {
    expect(CODE_DOC_TYPES.types).toEqual({
      "Repository Overview": "",
      Architecture: "architecture",
      Workflow: "workflows",
      "Domain Concept": "domain",
      "API Reference": "api",
      "Data Model": "data-models",
      Operations: "operations",
      Integration: "integrations",
      Testing: "testing",
      Reference: "reference",
    });
  });

  test("has the Reference fallback, preserving today's behavior", () => {
    expect(CODE_DOC_TYPES.fallback).toBe("Reference");
  });

  test("is frozen so callers cannot mutate the shared taxonomy", () => {
    expect(Object.isFrozen(CODE_DOC_TYPES.types)).toBe(true);
  });

  test("contains only sanitized labels and lowercase kebab-case directories", () => {
    for (const [type, directory] of Object.entries(CODE_DOC_TYPES.types)) {
      expect(type).toMatch(/^[A-Za-z][A-Za-z ]*$/u);
      expect(directory).toMatch(/^$|^[a-z][a-z-]*$/u);
    }
  });
});

describe("PERSONAL_DOC_TYPES", () => {
  test("maps the canonical personal-wiki surfaces to their directories", () => {
    expect(PERSONAL_DOC_TYPES.types).toEqual({
      Overview: "",
      Source: "sources",
      Topic: "topics",
    });
  });

  test("has the Note fallback", () => {
    expect(PERSONAL_DOC_TYPES.fallback).toBe("Note");
  });

  test("contains only sanitized labels and lowercase kebab-case directories", () => {
    for (const [type, directory] of Object.entries(
      PERSONAL_DOC_TYPES.types,
    )) {
      expect(type).toMatch(/^[A-Za-z][A-Za-z ]*$/u);
      expect(directory).toMatch(/^$|^[a-z][a-z-]*$/u);
    }
  });
});

describe("getDocTypeForDirectory", () => {
  test("resolves a recognized directory to its taxonomy type", () => {
    expect(getDocTypeForDirectory(CODE_DOC_TYPES, "operations")).toEqual({
      type: "Operations",
      isFallback: false,
    });
  });

  test("falls back to the taxonomy's fallback for an unrecognized directory", () => {
    expect(getDocTypeForDirectory(CODE_DOC_TYPES, "misc")).toEqual({
      type: "Reference",
      isFallback: true,
    });
  });

  test("uses the personal taxonomy's own types and fallback", () => {
    expect(getDocTypeForDirectory(PERSONAL_DOC_TYPES, "sources")).toEqual({
      type: "Source",
      isFallback: false,
    });
    expect(getDocTypeForDirectory(PERSONAL_DOC_TYPES, "misc")).toEqual({
      type: "Note",
      isFallback: true,
    });
  });
});

describe("getTaxonomyForMode", () => {
  test("selects the code taxonomy for repository output mode", () => {
    expect(getTaxonomyForMode("repository")).toBe(CODE_DOC_TYPES);
  });

  test("selects the personal taxonomy for local-wiki output mode", () => {
    expect(getTaxonomyForMode("local-wiki")).toBe(PERSONAL_DOC_TYPES);
  });
});

describe("getDefaultModelId", () => {
  test("returns the first model option for a provider", () => {
    expect(getDefaultModelId("anthropic")).toBe("claude-haiku-4-5");
    expect(getDefaultModelId(DEFAULT_PROVIDER)).toBe(DEFAULT_MODEL_ID);
  });

  test(
    "openai-compatible has no presets, so it falls back to the global " +
      "DEFAULT_MODEL_ID (a known cross-provider quirk documented here)",
    () => {
      // This asserts CURRENT behavior: openai-compatible has an empty
      // modelOptions list, so getDefaultModelId yields an OpenRouter id.
      // If this ever changes intentionally, update this test.
      expect(getDefaultModelId("openai-compatible")).toBe(DEFAULT_MODEL_ID);
    },
  );
});
