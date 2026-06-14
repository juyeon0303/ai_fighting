import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import { buildDebatePrompt, buildDebateRetryHint } from "./debate-content";
import type { PersonaLlmRuntime } from "./debate-llm-config";
import { requestGeminiTurn } from "./gemini";
import { personaDisplayName } from "./personas";
import { parseTopic } from "./topic-context";
import {
  clampTurnContent,
  isIncompleteTurn,
  maxOutputTokens,
} from "./debate-turn-budget";

const SYSTEM =
  "세 명이 주제에 대해 순서대로 대화한다. 직전 말에 이어 깊이를 더한다. 무난한 반말, 완전한 문장 1~2개.";

function systemForSpeaker(
  personaId: PersonaId,
  provider: PersonaLlmRuntime["provider"],
): string {
  const name = personaDisplayName(personaId, provider);
  return `${SYSTEM} 지금 말하는 사람은 ${name}이다.`;
}

export type LlmStopReason = "auth" | "quota" | "missing_key" | null;

export interface TurnResult {
  content: string;
  tokensUsed: number;
  source: "openai" | "gemini";
  stopReason: LlmStopReason;
}

function usageTotal(usage?: {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}): number {
  if (!usage) return 0;
  if (usage.total_tokens) return usage.total_tokens;
  return (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
}

function mapApiError(error: unknown): LlmStopReason {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;

  if (status === 401 || status === 403) return "auth";
  if (status === 402 || status === 429) return "quota";
  return null;
}

function normalizeTurn(raw: string | null, personaId: PersonaId): string {
  if (!raw?.trim()) return "";
  const clamped = clampTurnContent(raw, personaId);
  if (isIncompleteTurn(clamped)) return "";
  return clamped;
}

async function requestOpenAiTurn(
  client: OpenAI,
  model: string,
  system: string,
  prompt: string,
  personaId: PersonaId,
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxOutputTokens(personaId),
      temperature: 0.9,
    });

    return {
      content: response.choices[0]?.message?.content?.trim() ?? null,
      tokensUsed: usageTotal(response.usage),
      stopReason: null,
    };
  } catch (error) {
    return {
      content: null,
      tokensUsed: 0,
      stopReason: mapApiError(error),
    };
  }
}

async function callProviderTurn(
  runtime: PersonaLlmRuntime,
  system: string,
  prompt: string,
  personaId: PersonaId,
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  if (runtime.provider === "gemini") {
    return requestGeminiTurn(
      runtime.apiKey!,
      runtime.model,
      system,
      prompt,
      maxOutputTokens(personaId),
    );
  }

  return requestOpenAiTurn(
    new OpenAI({ apiKey: runtime.apiKey }),
    runtime.model,
    system,
    prompt,
    personaId,
  );
}

export async function generateDebateTurn(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  _debateId: string,
  runtime: PersonaLlmRuntime,
): Promise<TurnResult> {
  const ctx = parseTopic(topic);
  const source = runtime.provider === "gemini" ? "gemini" : "openai";

  if (!runtime.apiKey) {
    return {
      content: "",
      tokensUsed: 0,
      source,
      stopReason: "missing_key",
    };
  }

  const system = systemForSpeaker(personaId, source);
  let totalTokens = 0;
  let lastStopReason: LlmStopReason = null;

  const attempts = [
    buildDebatePrompt(ctx, personaId, history, round, source),
    `${buildDebatePrompt(ctx, personaId, history, round, source)}\n\n[다시] ${buildDebateRetryHint()}`,
  ];

  for (const prompt of attempts) {
    const result = await callProviderTurn(runtime, system, prompt, personaId);
    totalTokens += result.tokensUsed;
    if (result.stopReason) {
      lastStopReason = result.stopReason;
      break;
    }

    const content = normalizeTurn(result.content, personaId);
    if (content) {
      return {
        content,
        tokensUsed: totalTokens,
        source,
        stopReason: null,
      };
    }
  }

  return {
    content: "",
    tokensUsed: totalTokens,
    source,
    stopReason: lastStopReason,
  };
}
