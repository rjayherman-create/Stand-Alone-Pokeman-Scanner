import OpenAI from "openai";

const resolvedBaseUrl =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  ?? process.env.OPENAI_BASE_URL
  ?? "https://api.openai.com/v1";

const resolvedApiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ?? process.env.OPENAI_API_KEY;

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && resolvedBaseUrl) {
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = resolvedBaseUrl;
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && resolvedApiKey) {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = resolvedApiKey;
}

if (!resolvedBaseUrl) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

if (!resolvedApiKey) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

export const openai = new OpenAI({
  apiKey: resolvedApiKey,
  baseURL: resolvedBaseUrl,
});
