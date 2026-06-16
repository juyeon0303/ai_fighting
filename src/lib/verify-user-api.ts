import type { UserApiInput } from "./debate-llm-config";
import { requestGeminiTurn } from "./gemini";
import { normalizeGeminiModel } from "./gemini-models";
import { normalizeOpenaiModel } from "./openai-models";
import OpenAI from "openai";

export async function verifyUserApiKeys(
  input: UserApiInput,
): Promise<string | null> {
  const layout = input.layout;

  if (layout === "openai_only" || layout === "gpt_vs_gemini") {
    const key = input.openaiKey?.trim();
    if (!key) return "OpenAI API 키가 필요합니다.";

    try {
      const client = new OpenAI({ apiKey: key });
      const model = normalizeOpenaiModel(input.openaiModel);
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "ok" }],
        max_tokens: 5,
      });
      if (!res.choices[0]?.message?.content?.trim()) {
        return "OpenAI API 응답이 비어 있습니다. 모델명을 확인하세요.";
      }
    } catch (err) {
      const status =
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof (err as { status: unknown }).status === "number"
          ? (err as { status: number }).status
          : null;
      if (status === 401 || status === 403) {
        return "OpenAI API 키가 거부되었습니다. platform.openai.com에서 키를 확인하세요.";
      }
      if (status === 429) {
        return "OpenAI API 호출이 일시적으로 제한됩니다. 1~2분 후 다시 시도하세요.";
      }
      if (status === 402) {
        return "OpenAI API 한도가 초과되었습니다.";
      }
      return "OpenAI API 연결 실패 — 키와 모델(gpt-5.4-mini 등)을 확인하세요.";
    }
  }

  if (layout === "gemini_only" || layout === "gpt_vs_gemini") {
    const key = input.geminiKey?.trim();
    if (!key) return "Gemini API 키가 필요합니다.";

    const model = normalizeGeminiModel(input.geminiModel);
    const result = await requestGeminiTurn(
      key,
      model,
      "한국어로 한 단어로만 답해.",
      "연결 테스트",
    );

    if (result.stopReason === "auth") {
      return "Gemini API 키가 거부되었습니다. aistudio.google.com → API Keys에서 새 키를 만들고, 앞뒤 공백 없이 전체를 붙여넣으세요. (AIza 또는 AQ. 로 시작)";
    }
    if (result.stopReason === "rate_limit") {
      return "Gemini API 호출이 일시적으로 제한됩니다. 1~2분 후 다시 시도하세요.";
    }
    if (result.stopReason === "quota") {
      return "Gemini API 사용 한도가 초과되었습니다.";
    }
    if (!result.content) {
      return `Gemini API 연결 실패 (모델: ${model}). 키 형식(AIza/AQ.)과 모델을 확인하세요.`;
    }
  }

  return null;
}
