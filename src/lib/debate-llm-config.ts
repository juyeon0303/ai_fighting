import type { ApiLayout, Debate, PersonaId } from "./types";
import { decryptApiKey } from "./api-key-crypto";
import { DEFAULT_GEMINI_MODEL, normalizeGeminiModel } from "./gemini-models";
import { DEFAULT_OPENAI_MODEL, normalizeOpenaiModel } from "./openai-models";
import { tokensForTurn } from "./token-budget-guide";

export type ApiConnectionIssue =
  | "key_decrypt_failed"
  | "key_missing"
  | null;

export type LlmMode = "user_api";
export type ApiProvider = "openai" | "gemini";

export interface PersonaLlmRuntime {
  mode: LlmMode;
  provider: ApiProvider;
  apiKey?: string;
  model: string;
  maxTokenBudget: number | null;
  tokensUsed: number;
  tokenSaveMode: boolean;
}

export interface UserApiInput {
  layout: ApiLayout;
  openaiKey?: string;
  geminiKey?: string;
  openaiModel?: string;
  geminiModel?: string;
  maxTokenBudget?: number;
  tokenSaveMode?: boolean;
}

export function personaProvider(
  layout: ApiLayout,
  personaId: PersonaId,
): ApiProvider {
  if (layout === "openai_only") return "openai";
  if (layout === "gemini_only") return "gemini";
  if (personaId === "atlas") return "openai";
  return "gemini";
}

export function personaModel(
  debate: Debate,
  provider: ApiProvider,
): string {
  if (provider === "gemini") {
    return normalizeGeminiModel(debate.geminiModel ?? DEFAULT_GEMINI_MODEL);
  }
  return normalizeOpenaiModel(
    debate.openaiModel ?? debate.apiModel ?? DEFAULT_OPENAI_MODEL,
  );
}

export function providerLabel(provider: ApiProvider): string {
  return provider === "gemini" ? "Gemini" : "GPT";
}

export function layoutLabel(layout: ApiLayout | null): string {
  if (layout === "gemini_only") return "Gemini";
  if (layout === "gpt_vs_gemini") return "GPT vs Gemini";
  return "GPT";
}

export function resolveApiLayout(debate: Debate): ApiLayout | null {
  if (debate.apiLayout) return debate.apiLayout;
  if (debate.encryptedGeminiKey && !debate.encryptedApiKey) {
    return "gemini_only";
  }
  if (debate.encryptedApiKey && !debate.encryptedGeminiKey) {
    return "openai_only";
  }
  if (debate.encryptedApiKey && debate.encryptedGeminiKey) {
    return "gpt_vs_gemini";
  }
  if (debate.apiProvider === "gemini") return "gemini_only";
  if (debate.apiProvider === "openai") return "openai_only";
  return null;
}

export function resolveUserApiConnectionIssue(debate: Debate): ApiConnectionIssue {
  const layout = resolveApiLayout(debate);
  if (!layout) return "key_missing";

  const needsOpenai = layout !== "gemini_only";
  const needsGemini = layout !== "openai_only";

  if (needsOpenai) {
    if (!debate.encryptedApiKey) return "key_missing";
    if (!decryptApiKey(debate.encryptedApiKey)) return "key_decrypt_failed";
  }
  if (needsGemini) {
    if (!debate.encryptedGeminiKey) return "key_missing";
    if (!decryptApiKey(debate.encryptedGeminiKey)) return "key_decrypt_failed";
  }

  return null;
}

export function resolvePersonaLlmRuntime(
  debate: Debate,
  personaId: PersonaId,
): PersonaLlmRuntime {
  const base = {
    maxTokenBudget: debate.maxTokenBudget,
    tokensUsed: debate.tokensUsed,
    tokenSaveMode: debate.tokenSaveMode ?? false,
  };

  const layout = resolveApiLayout(debate);
  if (!layout) {
    return {
      mode: "user_api",
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      ...base,
    };
  }

  const provider = personaProvider(layout, personaId);
  const model = personaModel(debate, provider);
  const encrypted =
    provider === "gemini"
      ? debate.encryptedGeminiKey
      : debate.encryptedApiKey;
  const apiKey = encrypted ? decryptApiKey(encrypted) ?? undefined : undefined;

  return {
    mode: "user_api",
    provider,
    apiKey,
    model,
    ...base,
  };
}

export function resolveDebateAnalysisOptions(debate: Debate): {
  apiKey?: string;
  model: string;
  provider: ApiProvider;
} | null {
  const layout = resolveApiLayout(debate);
  if (!layout) return null;

  if (layout === "gemini_only" || layout === "gpt_vs_gemini") {
    const key = debate.encryptedGeminiKey
      ? decryptApiKey(debate.encryptedGeminiKey)
      : null;
    if (key) {
      return {
        apiKey: key,
        model: personaModel(debate, "gemini"),
        provider: "gemini",
      };
    }
  }

  const openaiKey = debate.encryptedApiKey
    ? decryptApiKey(debate.encryptedApiKey)
    : null;
  if (openaiKey) {
    return {
      apiKey: openaiKey,
      model: personaModel(debate, "openai"),
      provider: "openai",
    };
  }

  return null;
}

/** 다음 발언 1회 + 여유분 — 이보다 적으면 토큰 부족으로 처리 */
export const MIN_TURN_TOKEN_RESERVE = 500;

export function getRemainingTokenBudget(debate: {
  maxTokenBudget: number;
  tokensUsed: number;
}): number {
  if (debate.maxTokenBudget <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, debate.maxTokenBudget - debate.tokensUsed);
}

export function minTokenReserveForDebate(debate: Debate): number {
  const layout = resolveApiLayout(debate) ?? "gemini_only";
  const save = debate.tokenSaveMode ?? false;
  const perTurn = tokensForTurn(0, save, layout);
  return perTurn + 200;
}

export function isTokenBudgetLow(
  tokensUsed: number,
  maxTokenBudget: number,
  reserve = MIN_TURN_TOKEN_RESERVE,
): boolean {
  if (maxTokenBudget <= 0) return false;
  if (tokensUsed >= maxTokenBudget) return true;
  return maxTokenBudget - tokensUsed < reserve;
}

export function isTokenBudgetExceeded(debate: Debate): boolean {
  if (debate.maxTokenBudget <= 0) return false;
  return debate.tokensUsed >= debate.maxTokenBudget;
}

export function isTokenBudgetInsufficient(debate: Debate): boolean {
  if (debate.maxTokenBudget <= 0) return false;
  return isTokenBudgetLow(
    debate.tokensUsed,
    debate.maxTokenBudget,
    minTokenReserveForDebate(debate),
  );
}

export function sanitizeDebateForClient(debate: Debate): Debate & {
  apiConnectionIssue: ApiConnectionIssue;
} {
  const {
    encryptedApiKey: _a,
    encryptedGeminiKey: _g,
    ...safe
  } = debate;
  return {
    ...safe,
    apiConnectionIssue: resolveUserApiConnectionIssue(debate),
  };
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
  const budget = input.maxTokenBudget ?? 0;
  if (budget > 0 && budget < MIN_TURN_TOKEN_RESERVE) {
    return "토큰이 부족합니다.";
  }
  return null;
}
