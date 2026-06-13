import type { LlmStopReason } from "./llm";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

function mapGeminiError(status: number): LlmStopReason {
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status === 402) return "quota";
  return null;
}

export async function requestGeminiTurn(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<{
  content: string | null;
  tokensUsed: number;
  stopReason: LlmStopReason;
}> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.9,
        },
      }),
    });

    if (!res.ok) {
      return {
        content: null,
        tokensUsed: 0,
        stopReason: mapGeminiError(res.status),
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        totalTokenCount?: number;
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    const usage = data.usageMetadata;
    const tokensUsed =
      usage?.totalTokenCount ??
      (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0);

    return { content: text, tokensUsed, stopReason: null };
  } catch {
    return { content: null, tokensUsed: 0, stopReason: null };
  }
}
