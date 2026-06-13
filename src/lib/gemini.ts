import type { LlmStopReason } from "./llm";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
  normalizeGeminiModel,
} from "./gemini-models";

export { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_OPTIONS } from "./gemini-models";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const FETCH_TIMEOUT_MS = 20_000;

export function isLikelyGeminiKey(key: string): boolean {
  const k = key.trim();
  if (k.length < 20) return false;
  return k.startsWith("AIza") || k.startsWith("AQ.");
}

function mapGeminiError(status: number): LlmStopReason {
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status === 402) return "quota";
  return null;
}

function modelCandidates(preferred: string): string[] {
  return [
    ...new Set([
      normalizeGeminiModel(preferred),
      ...GEMINI_MODEL_FALLBACKS,
    ]),
  ];
}

function authModes(apiKey: string): Array<"header" | "query"> {
  // Google 공식: x-goog-api-key 헤더만 사용. Bearer는 AQ./AIza 모두 거부될 수 있음.
  return ["header", "query"];
}

function buildGenerationConfig(model: string): Record<string, unknown> {
  const base = { maxOutputTokens: 220 };
  // Gemini 3.x는 temperature 미권장 — 400 오류 방지
  if (!model.startsWith("gemini-3")) {
    return { ...base, temperature: 0.9 };
  }
  return base;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiOnce(
  apiKey: string,
  model: string,
  body: object,
  auth: "header" | "query",
): Promise<{ ok: boolean; status: number; data?: unknown; errorText?: string }> {
  const base = `${GEMINI_BASE}/${model}:generateContent`;
  const url =
    auth === "query"
      ? `${base}?key=${encodeURIComponent(apiKey.trim())}`
      : base;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth === "header") {
    headers["x-goog-api-key"] = apiKey.trim();
  }

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return { ok: false, status: res.status, errorText: errorText.slice(0, 500) };
  }

  const data = await res.json();
  return { ok: true, status: res.status, data };
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
  let lastStatus = 0;
  let lastError = "";
  let sawAuthError = false;
  let sawQuotaError = false;

  for (const candidateModel of modelCandidates(model)) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: buildGenerationConfig(candidateModel),
    };

    for (const auth of authModes(apiKey)) {
      try {
        const result = await callGeminiOnce(
          apiKey,
          candidateModel,
          body,
          auth,
        );

        if (!result.ok) {
          lastStatus = result.status;
          lastError = result.errorText ?? "";
          const stop = mapGeminiError(result.status);
          console.warn(
            `[gemini] ${candidateModel} (${auth}) → ${result.status}`,
            lastError,
          );
          if (stop === "auth") sawAuthError = true;
          if (stop === "quota") sawQuotaError = true;
          continue;
        }

        const data = result.data as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
          usageMetadata?: {
            totalTokenCount?: number;
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };

        const text =
          data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
        const usage = data.usageMetadata;
        const tokensUsed =
          usage?.totalTokenCount ??
          (usage?.promptTokenCount ?? 0) +
            (usage?.candidatesTokenCount ?? 0);

        if (text) {
          return { content: text, tokensUsed, stopReason: null };
        }

        lastError = `empty response (${candidateModel})`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[gemini] ${candidateModel} (${auth}) failed:`, lastError);
      }
    }
  }

  if (sawQuotaError) {
    return { content: null, tokensUsed: 0, stopReason: "quota" };
  }
  if (sawAuthError) {
    return { content: null, tokensUsed: 0, stopReason: "auth" };
  }

  if (lastStatus) {
    console.warn("[gemini] all attempts failed", { lastStatus, lastError });
    return {
      content: null,
      tokensUsed: 0,
      stopReason: mapGeminiError(lastStatus),
    };
  }

  console.warn("[gemini] no usable response", lastError);
  return { content: null, tokensUsed: 0, stopReason: null };
}
