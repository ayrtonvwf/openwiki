export const OPEN_WIKI_DIR = "openwiki";
export const UPDATE_METADATA_PATH = `${OPEN_WIKI_DIR}/.last-update.json`;
export const OKF_STATE_PATH = `${OPEN_WIKI_DIR}/.okf-state.json`;
export const OKF_LOG_PATH = `${OPEN_WIKI_DIR}/log.md`;
export const OKF_LOG_HEADER = "# Change Log";
export const OKF_VERSION = "0.1";
export const BASETEN_API_KEY_ENV_KEY = "BASETEN_API_KEY";
export const FIREWORKS_API_KEY_ENV_KEY = "FIREWORKS_API_KEY";
export const OPENAI_API_KEY_ENV_KEY = "OPENAI_API_KEY";
export const OPENAI_COMPATIBLE_API_KEY_ENV_KEY = "OPENAI_COMPATIBLE_API_KEY";
export const OPENAI_COMPATIBLE_BASE_URL_ENV_KEY = "OPENAI_COMPATIBLE_BASE_URL";
export const ANTHROPIC_API_KEY_ENV_KEY = "ANTHROPIC_API_KEY";
export const ANTHROPIC_BASE_URL_ENV_KEY = "ANTHROPIC_BASE_URL";
export const OPENROUTER_API_KEY_ENV_KEY = "OPENROUTER_API_KEY";
export const OPENWIKI_PROVIDER_ENV_KEY = "OPENWIKI_PROVIDER";
export const OPENWIKI_MODEL_ID_ENV_KEY = "OPENWIKI_MODEL_ID";
export const OPENWIKI_OKF_ENV_KEY = "OPENWIKI_OKF";
export const DEFAULT_PROVIDER = "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenWikiProvider =
  | "anthropic"
  | "baseten"
  | "fireworks"
  | "openai"
  | "openai-compatible"
  | "openrouter";

export type SelectableOpenWikiProvider = OpenWikiProvider;

export type ProviderModelOption = {
  id: string;
  label: string;
};

type ProviderConfig = {
  apiKeyEnvKey: string;
  baseURL?: string;
  /**
   * Environment variable that, when set, overrides {@link ProviderConfig.baseURL}
   * with an alternative base URL (e.g. a self-hosted or proxied endpoint).
   */
  baseUrlEnvKey?: string;
  /**
   * When true, the provider has no default endpoint and requires a base URL to
   * be supplied via {@link ProviderConfig.baseUrlEnvKey}.
   */
  requiresBaseUrl?: boolean;
  label: string;
  modelOptions: ProviderModelOption[];
};

export const SELECTABLE_OPENWIKI_PROVIDERS = [
  "openrouter",
  "baseten",
  "fireworks",
  "openai",
  "openai-compatible",
  "anthropic",
] as const satisfies readonly SelectableOpenWikiProvider[];

export const PROVIDER_CONFIGS: Record<OpenWikiProvider, ProviderConfig> = {
  baseten: {
    apiKeyEnvKey: BASETEN_API_KEY_ENV_KEY,
    baseURL: "https://inference.baseten.co/v1",
    label: "Baseten",
    modelOptions: [
      { id: "zai-org/GLM-5.2", label: "GLM 5.2" },
      { id: "moonshotai/Kimi-K2.7-Code", label: "Kimi K2.7 Code" },
    ],
  },
  fireworks: {
    apiKeyEnvKey: FIREWORKS_API_KEY_ENV_KEY,
    baseURL: "https://api.fireworks.ai/inference/v1",
    label: "Fireworks",
    modelOptions: [
      { id: "accounts/fireworks/models/glm-5p2", label: "GLM 5.2" },
      {
        id: "accounts/fireworks/models/kimi-k2p7-code",
        label: "Kimi K2.7 Code",
      },
    ],
  },
  openai: {
    apiKeyEnvKey: OPENAI_API_KEY_ENV_KEY,
    label: "OpenAI",
    modelOptions: [
      { id: "gpt-5.4-mini", label: "5.4 mini" },
      { id: "gpt-5.5", label: "5.5" },
    ],
  },
  "openai-compatible": {
    apiKeyEnvKey: OPENAI_COMPATIBLE_API_KEY_ENV_KEY,
    baseUrlEnvKey: OPENAI_COMPATIBLE_BASE_URL_ENV_KEY,
    requiresBaseUrl: true,
    label: "OpenAI-compatible",
    modelOptions: [],
  },
  anthropic: {
    apiKeyEnvKey: ANTHROPIC_API_KEY_ENV_KEY,
    baseUrlEnvKey: ANTHROPIC_BASE_URL_ENV_KEY,
    label: "Anthropic",
    modelOptions: [
      { id: "claude-haiku-4-5", label: "Haiku" },
      { id: "claude-sonnet-5", label: "Sonnet" },
      { id: "claude-opus-4-8", label: "Opus" },
    ],
  },
  openrouter: {
    apiKeyEnvKey: OPENROUTER_API_KEY_ENV_KEY,
    baseURL: OPENROUTER_BASE_URL,
    label: "OpenRouter",
    modelOptions: [
      { id: "z-ai/glm-5.2", label: "GLM 5.2" },
      { id: "openrouter/fusion", label: "OpenRouter Fusion" },
      { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code" },
      { id: "anthropic/claude-opus-4-8", label: "Claude Opus" },
      { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet" },
      { id: "openai/gpt-5.4-mini", label: "GPT 5.4 mini" },
      { id: "openai/gpt-5.5", label: "GPT 5.5" },
    ],
  },
};

export const DEFAULT_MODEL_ID =
  PROVIDER_CONFIGS[DEFAULT_PROVIDER].modelOptions[0]?.id ?? "zai-org/GLM-5.2";

export const SUGGESTED_MODEL_IDS = PROVIDER_CONFIGS[
  DEFAULT_PROVIDER
].modelOptions.map((model) => model.id);

export function getProviderConfig(provider: OpenWikiProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

export function getProviderLabel(provider: OpenWikiProvider): string {
  return getProviderConfig(provider).label;
}

export function getProviderApiKeyEnvKey(provider: OpenWikiProvider): string {
  return getProviderConfig(provider).apiKeyEnvKey;
}

/**
 * Resolves the base URL for a provider, preferring an alternative base URL from
 * the provider's configured environment variable over the built-in default.
 * Returns `undefined` when neither is set, so callers fall back to the SDK's
 * own default endpoint.
 */
export function resolveProviderBaseUrl(
  provider: OpenWikiProvider,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const config = getProviderConfig(provider);
  const override = config.baseUrlEnvKey ? env[config.baseUrlEnvKey] : undefined;
  const trimmedOverride = override?.trim();

  if (trimmedOverride) {
    return trimmedOverride;
  }

  return config.baseURL;
}

export function getProviderBaseUrlEnvKey(
  provider: OpenWikiProvider,
): string | undefined {
  return getProviderConfig(provider).baseUrlEnvKey;
}

export function providerRequiresBaseUrl(provider: OpenWikiProvider): boolean {
  return getProviderConfig(provider).requiresBaseUrl === true;
}

export function isValidBaseUrl(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getProviderModelOptions(
  provider: OpenWikiProvider,
): ProviderModelOption[] {
  return getProviderConfig(provider).modelOptions;
}

export function getDefaultModelId(provider: OpenWikiProvider): string {
  return getProviderModelOptions(provider)[0]?.id ?? DEFAULT_MODEL_ID;
}

export function normalizeProvider(
  value: string | null | undefined,
): OpenWikiProvider | null {
  if (value === undefined || value === null) {
    return null;
  }

  const provider = value.trim().toLowerCase();

  return isValidProvider(provider) ? provider : null;
}

export function isValidProvider(value: string): value is OpenWikiProvider {
  return value in PROVIDER_CONFIGS;
}

export function resolveConfiguredProvider(
  env: NodeJS.ProcessEnv = process.env,
): OpenWikiProvider {
  return (
    normalizeProvider(env[OPENWIKI_PROVIDER_ENV_KEY]) ??
    (env[OPENROUTER_API_KEY_ENV_KEY] ? "openrouter" : DEFAULT_PROVIDER)
  );
}

/**
 * OKF output is strictly opt-in: resolves `true` only for recognized truthy
 * values of {@link OPENWIKI_OKF_ENV_KEY} ("1"/"true", case-insensitive), and
 * defaults to `false` otherwise.
 */
export function resolveOkfEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[OPENWIKI_OKF_ENV_KEY]?.trim().toLowerCase();

  return value === "1" || value === "true";
}

const REPO_DOC_TYPE_NAME_PATTERN = /^[A-Za-z][A-Za-z ]*$/u;
const REPO_DOC_TYPE_DIRECTORY_PATTERN = /^[a-z][a-z-]*$/u;

/**
 * Validates `REPO_DOC_TYPES` entries at module load so that only plain
 * alphabetic labels and lowercase kebab-case directories (or the root
 * directory, represented by "") can ever reach a prompt or frontmatter.
 */
function assertSanitizedRepoDocTypes(
  types: Record<string, string>,
): Readonly<Record<string, string>> {
  for (const [type, directory] of Object.entries(types)) {
    if (!REPO_DOC_TYPE_NAME_PATTERN.test(type)) {
      throw new Error(
        `Invalid REPO_DOC_TYPES type label: ${JSON.stringify(type)}`,
      );
    }

    if (directory !== "" && !REPO_DOC_TYPE_DIRECTORY_PATTERN.test(directory)) {
      throw new Error(
        `Invalid REPO_DOC_TYPES directory for ${JSON.stringify(type)}: ` +
          JSON.stringify(directory),
      );
    }
  }

  return Object.freeze(types);
}

/**
 * Default OKF type taxonomy (§4.4): maps each documentation type to the
 * bundle directory it applies to. The "Repository Overview" type applies to
 * the bundle root, so its directory is "". Adding a new type is a one-line
 * change.
 */
export const REPO_DOC_TYPES: Readonly<Record<string, string>> =
  assertSanitizedRepoDocTypes({
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

export const REPO_DOC_TYPE_FALLBACK = "Reference";

const DIRECTORY_TO_REPO_DOC_TYPE: ReadonlyMap<string, string> = new Map(
  Object.entries(REPO_DOC_TYPES).map(([type, directory]) => [directory, type]),
);

/**
 * Inverts {@link REPO_DOC_TYPES} to infer a page's `type` from the top-level
 * directory it lives in. Directories with no taxonomy entry resolve to
 * {@link REPO_DOC_TYPE_FALLBACK} with `isFallback: true`, so callers can flag
 * the classification in a conformance report instead of leaving `type` empty.
 */
export function getRepoDocTypeForDirectory(directory: string): {
  type: string;
  isFallback: boolean;
} {
  const type = DIRECTORY_TO_REPO_DOC_TYPE.get(directory);

  return type === undefined
    ? { type: REPO_DOC_TYPE_FALLBACK, isFallback: true }
    : { type, isFallback: false };
}

export function normalizeModelId(value: string): string {
  return value.trim();
}

export function isValidModelId(value: string): boolean {
  const modelId = normalizeModelId(value);

  return (
    modelId.length > 0 &&
    modelId.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/u.test(modelId) &&
    !modelId.includes("://")
  );
}

export const OPENWIKI_VERSION = "0.0.2";
