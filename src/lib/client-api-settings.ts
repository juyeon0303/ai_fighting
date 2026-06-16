import type { ApiLayout } from "@/lib/types";
import {
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiModel,
} from "./gemini-models";
import {
  DEFAULT_OPENAI_MODEL,
  normalizeOpenaiModel,
} from "./openai-models";

export interface SavedApiSettings {
  enabled: boolean;
  layout: ApiLayout;
  openaiKey: string;
  geminiKey: string;
  openaiModel: string;
  geminiModel: string;
  maxTokenBudget: number;
  tokenSaveMode: boolean;
}

const STORAGE_KEY = "ai-debate-arena-api-settings";

export const DEFAULT_MAX_TOKEN_BUDGET = 30_000;

export function loadApiSettings(): SavedApiSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedApiSettings> & {
      apiKey?: string;
      model?: string;
    };
    if (!parsed.enabled) return null;
    return {
      enabled: true,
      layout: parsed.layout ?? "gemini_only",
      openaiKey: parsed.openaiKey ?? parsed.apiKey ?? "",
      geminiKey: parsed.geminiKey ?? "",
      openaiModel: normalizeOpenaiModel(
        parsed.openaiModel ?? parsed.model ?? DEFAULT_OPENAI_MODEL,
      ),
      geminiModel: normalizeGeminiModel(parsed.geminiModel),
      maxTokenBudget: parsed.maxTokenBudget ?? DEFAULT_MAX_TOKEN_BUDGET,
      tokenSaveMode: parsed.tokenSaveMode ?? false,
    };
  } catch {
    return null;
  }
}

export function saveApiSettings(settings: SavedApiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearApiSettings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
