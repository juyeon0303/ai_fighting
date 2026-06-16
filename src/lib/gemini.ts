import type { LlmStopReason } from "./llm";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
  normalizeGeminiModel,
} from "./gemini-models";

export { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_OPTIONS } from "./gemini-models";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const FETCH_TIMEOUT_MS = 45_000;
const FETCH_TIMEOUT_SEARCH_MS = 90_000;

export type GeminiContent = { role: "user" | "model"; text: string };

export type GeminiRequestOptions = {
  /** Google Search grounding — 사실·최신 정보 확인용 */
  googleSearch?: boolean;
};

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
  return ["header", "query"];
}

function buildGenerationConfig(
  model: string,
  maxOutputTokens: number,
): Record<string, unknown> {
  const base = { maxOutputTokens };
  if (!model.startsWith("gemini-3")) {
    return { ...base, temperature: 0.75 };
  }
  return base;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildGeminiBody(
  system: string,
  apiContents: Array<{ role: string; parts: Array<{ text: string }> }>,
  model: string,
  outputTokenLimit: number,
  googleSearch: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: apiContents,
    generationConfig: buildGenerationConfig(model, outputTokenLimit),
  };
  if (googleSearch) {
    body.tools = [{ google_search: {} }];
  }
  return body;
}

async function callGeminiOnce(
  apiKey: string,
  model: string,
  body: object,
  auth: "header" | "query",
  timeoutMs = FETCH_TIMEOUT_MS,
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

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return { ok: false, status: res.status, errorText: errorText.slice(0, 500) };
  }

  const data = await res.json();
  return { ok: true, status: res.status, data };
}

function extractGeminiText(data: unknown): string | null {
  const d = data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      totalTokenCount?: number;
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };

  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
}

function extractGeminiTokens(data: unknown): number {
  const usage = (data as { usageMetadata?: Record<string, number> })
    .usageMetadata;
  if (!usage) return 0;
  return (
    usage.totalTokenCount ??
    (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0)
  );
}

/** Gemini 앱 방식 — user/model 멀티턴 */
export async function requestGeminiChat(
  apiKey: string,
  model: string,
  system: string,
  contents: GeminiContent[],
  outputTokenLimit = 1024,
  options: GeminiRequestOptions = {},
): Promise<{
  content: string | null;
  tokensUsed: number;
  stopReason: LlmStopReason;
}> {
  let lastStatus = 0;
  let lastError = "";
  let sawAuthError = false;
  let sawQuotaError = false;

  const apiContents = contents.map((c) => ({
    role: c.role,
    parts: [{ text: c.text }],
  }));

  const searchModes = options.googleSearch ? [true, false] : [false];

  for (const candidateModel of modelCandidates(model)) {
    for (const useSearch of searchModes) {
      const body = buildGeminiBody(
        system,
        apiContents,
        candidateModel,
        outputTokenLimit,
        useSearch,
      );
      const timeoutMs = useSearch ? FETCH_TIMEOUT_SEARCH_MS : FETCH_TIMEOUT_MS;

      for (const auth of authModes(apiKey)) {
        try {
          const result = await callGeminiOnce(
            apiKey,
            candidateModel,
            body,
            auth,
            timeoutMs,
          );

          if (!result.ok) {
            lastStatus = result.status;
            lastError = result.errorText ?? "";
            const stop = mapGeminiError(result.status);
            console.warn(
              `[gemini] ${candidateModel} (${auth}${useSearch ? ", search" : ""}) → ${result.status}`,
              lastError,
            );
            if (stop === "auth") sawAuthError = true;
            if (stop === "quota") sawQuotaError = true;
            continue;
          }

          const text = extractGeminiText(result.data);
          const tokensUsed = extractGeminiTokens(result.data);

          if (text) {
            return { content: text, tokensUsed, stopReason: null };
          }

          lastError = `empty response (${candidateModel})`;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[gemini] ${candidateModel} (${auth}${useSearch ? ", search" : ""}) failed:`,
            lastError,
          );
        }
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

/** 단일 user 메시지 (키 검증·분석용) */
export async function requestGeminiTurn(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  outputTokenLimit = 90,
): Promise<{
  content: string | null;
  tokensUsed: number;
  stopReason: LlmStopReason;
}> {
  return requestGeminiChat(
    apiKey,
    model,
    system,
    [{ role: "user", text: user }],
    outputTokenLimit,
  );
}
