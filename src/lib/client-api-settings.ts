import type { ApiLayout } from "./types";

export interface SavedApiSettings {
  enabled: boolean;
  layout: ApiLayout;
  openaiKey: string;
  geminiKey: string;
  openaiModel: string;
  geminiModel: string;
  maxTokenBudget: number;
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
      layout: parsed.layout ?? "openai_only",
      openaiKey: parsed.openaiKey ?? parsed.apiKey ?? "",
      geminiKey: parsed.geminiKey ?? "",
      openaiModel: parsed.openaiModel ?? parsed.model ?? "gpt-4o-mini",
      geminiModel: parsed.geminiModel ?? "gemini-2.0-flash",
      maxTokenBudget: parsed.maxTokenBudget ?? DEFAULT_MAX_TOKEN_BUDGET,
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
