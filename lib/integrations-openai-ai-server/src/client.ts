import OpenAI from "openai";

function requireOpenAiBaseUrl(): string {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }

  return baseUrl;
}

function requireOpenAiApiKey(): string {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }

  return apiKey;
}

let openaiInstance: OpenAI | undefined;

function getProxyValue<T extends object>(
  target: T,
  property: PropertyKey,
): unknown {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}

export function getOpenAI(): OpenAI {
  openaiInstance ??= new OpenAI({
    apiKey: requireOpenAiApiKey(),
    baseURL: requireOpenAiBaseUrl(),
  });

  return openaiInstance;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, property) {
    return getProxyValue(getOpenAI(), property);
  },
});
