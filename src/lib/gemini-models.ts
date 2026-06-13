/** Gemini API 모델 ID — 앱 UI 표시명과 API slug 매핑 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export const GEMINI_MODEL_OPTIONS = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash (추천 · 앱과 동일)",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite (가벼움)",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (고품질)",
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
  },
] as const;

export const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
] as const;

/** 구버전(2.0/1.5) 저장값 → 현재 API 모델로 자동 교체 */
const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash-8b",
]);

export function normalizeGeminiModel(model?: string): string {
  if (!model || DEPRECATED_GEMINI_MODELS.has(model)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return model;
}
