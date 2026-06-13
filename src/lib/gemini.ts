import type { LlmStopReason } from "./llm";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
} from "./gemini-models";

export { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_OPTIONS } from "./gemini-models";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTTP_ATTEMPTS = 4;

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
  return [...new Set([preferred, ...GEMINI_MODEL_FALLBACKS])].slice(0, 2);
}

function authModes(apiKey: string): Array<"header" | "query" | "bearer"> {
  return apiKey.trim().startsWith("AQ.")
    ? ["bearer", "header", "query"]
    : ["header", "query"];
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
  auth: "header" | "query" | "bearer",
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
  } else if (auth === "bearer") {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return { ok: false, status: res.status, errorText: errorText.slice(0, 300) };
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
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.9,
    },
  };

  let attempts = 0;
  let lastStatus = 0;
  let lastError = "";

  for (const candidateModel of modelCandidates(model)) {
    for (const auth of authModes(apiKey)) {
      if (attempts >= MAX_HTTP_ATTEMPTS) break;
      attempts++;

      try {
        const result = await callGeminiOnce(apiKey, candidateModel, body, auth);

        if (!result.ok) {
          lastStatus = result.status;
          lastError = result.errorText ?? "";
          const stop = mapGeminiError(result.status);
          if (stop) {
            console.warn(
              `[gemini] ${candidateModel} ${auth} → ${result.status}`,
              lastError,
            );
            return { content: null, tokensUsed: 0, stopReason: stop };
          }
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
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[gemini] attempt ${attempts} failed:`, lastError);
      }
    }
  }

  if (lastStatus) {
    return {
      content: null,
      tokensUsed: 0,
      stopReason: mapGeminiError(lastStatus),
    };
  }

  return { content: null, tokensUsed: 0, stopReason: null };
}
