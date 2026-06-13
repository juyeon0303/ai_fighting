/** OpenAI API 모델 ID — 공식 API 기준 (2026.06) */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export const OPENAI_MODEL_OPTIONS = [
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini (추천 · 저렴·빠름)",
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 Nano (가장 가벼움)",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4 (고품질)",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5 (최고급)",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini (구버전 · 호환)",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o (구버전 · 호환)",
  },
] as const;

/** 저장값 없을 때만 신규 기본값 적용. 구버전 ID는 API에서 아직 동작함 */
export function normalizeOpenaiModel(model?: string): string {
  if (!model?.trim()) return DEFAULT_OPENAI_MODEL;
  return model.trim();
}
