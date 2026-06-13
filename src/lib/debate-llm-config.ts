import type { ApiLayout, Debate, PersonaId } from "./types";
import { decryptApiKey } from "./api-key-crypto";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";

export type LlmMode = "free" | "user_api";
export type ApiProvider = "openai" | "gemini";

export interface PersonaLlmRuntime {
  mode: LlmMode;
  provider: ApiProvider | "engine";
  apiKey?: string;
  model: string;
  maxTokenBudget: number | null;
  tokensUsed: number;
}

export interface UserApiInput {
  layout: ApiLayout;
  openaiKey?: string;
  geminiKey?: string;
  openaiModel?: string;
  geminiModel?: string;
  maxTokenBudget?: number;
}


export function personaProvider(
  layout: ApiLayout,
  personaId: PersonaId,
): ApiProvider {
  if (layout === "openai_only") return "openai";
  if (layout === "gemini_only") return "gemini";
  if (personaId === "pro" || personaId === "moderator") return "openai";
  return "gemini";
}

export function personaModel(
  debate: Debate,
  provider: ApiProvider,
): string {
  if (provider === "gemini") {
    return debate.geminiModel ?? DEFAULT_GEMINI_MODEL;
  }
  return debate.openaiModel ?? debate.apiModel ?? DEFAULT_OPENAI_MODEL;
}

export function providerLabel(provider: ApiProvider): string {
  return provider === "gemini" ? "Gemini" : "GPT";
}

export function layoutLabel(layout: ApiLayout | null): string {
  if (layout === "gemini_only") return "Gemini";
  if (layout === "gpt_vs_gemini") return "GPT vs Gemini";
  if (layout === "openai_only") return "GPT";
  return "무료";
}

export function resolveApiLayout(debate: Debate): ApiLayout | null {
  if (debate.apiLayout) return debate.apiLayout;
  if (debate.llmMode !== "user_api") return null;
  if (debate.encryptedApiKey && debate.encryptedGeminiKey) {
    return "gpt_vs_gemini";
  }
  if (debate.apiProvider === "gemini" || debate.encryptedGeminiKey) {
    return "gemini_only";
  }
  if (debate.apiProvider === "openai" || debate.encryptedApiKey) {
    return "openai_only";
  }
  return "openai_only";
}

export function resolvePersonaLlmRuntime(
  debate: Debate,
  personaId: PersonaId,
): PersonaLlmRuntime {
  const base = {
    maxTokenBudget:
      debate.llmMode === "user_api" ? debate.maxTokenBudget : null,
    tokensUsed: debate.tokensUsed,
  };

  const layout = resolveApiLayout(debate);
  if (debate.llmMode !== "user_api" || !layout) {
    return {
      mode: "free",
      provider: "engine",
      model: DEFAULT_OPENAI_MODEL,
      ...base,
    };
  }

  const provider = personaProvider(layout, personaId);
  const model = personaModel(debate, provider);

  const encrypted =
    provider === "gemini"
      ? debate.encryptedGeminiKey
      : debate.encryptedApiKey;

  const apiKey = encrypted ? decryptApiKey(encrypted) : null;

  if (encrypted && !apiKey) {
    console.warn(
      `[llm] ${provider} key decrypt failed for debate ${debate.id} — engine fallback`,
    );
  }

  if (!apiKey) {
    return {
      mode: "free",
      provider: "engine",
      model,
      ...base,
    };
  }

  return {
    mode: "user_api",
    provider,
    apiKey,
    model,
    ...base,
  };
}

/** @deprecated resolvePersonaLlmRuntime(debate, personaId) 사용 */
export function resolveDebateLlmRuntime(
  debate: Debate,
  personaId: PersonaId,
): PersonaLlmRuntime {
  return resolvePersonaLlmRuntime(debate, personaId);
}

export function isTokenBudgetExceeded(debate: Debate): boolean {
  if (debate.llmMode !== "user_api") return false;
  if (debate.maxTokenBudget <= 0) return false;
  return debate.tokensUsed >= debate.maxTokenBudget;
}

export function sanitizeDebateForClient(debate: Debate): Debate {
  const {
    encryptedApiKey: _a,
    encryptedGeminiKey: _g,
    ...safe
  } = debate;
  return safe;
}

export function validateUserApiInput(input: UserApiInput): string | null {
  const layout = input.layout;
  if (layout === "openai_only" && !input.openaiKey?.trim()) {
    return "OpenAI API 키가 필요합니다.";
  }
  if (layout === "gemini_only" && !input.geminiKey?.trim()) {
    return "Gemini API 키가 필요합니다.";
  }
  if (layout === "gpt_vs_gemini") {
    if (!input.openaiKey?.trim()) return "GPT vs Gemini 모드에는 OpenAI 키가 필요합니다.";
    if (!input.geminiKey?.trim()) return "GPT vs Gemini 모드에는 Gemini 키가 필요합니다.";
  }
  return null;
}
