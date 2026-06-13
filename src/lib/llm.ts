import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  buildDebatePrompt,
  generateMockTurn,
  passesMinimumQuality,
  validateResponse,
} from "./debate-content";
import type { PersonaLlmRuntime } from "./debate-llm-config";
import { requestGeminiTurn } from "./gemini";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";
import { parseTopic } from "./topic-context";
import {
  clampTurnContent,
  maxOutputTokens,
  softenFormalTone,
} from "./debate-turn-budget";

const SYSTEM = "한국어 토론. 1~2문장. 평서체. 주제 핵심만.";

export type LlmStopReason = "auth" | "quota" | null;

export interface TurnResult {
  content: string;
  tokensUsed: number;
  source: "openai" | "gemini" | "engine";
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

function polishApiTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  raw: string,
): string | null {
  const softened = softenFormalTone(raw);
  const clamped = clampTurnContent(softened, personaId);
  if (!passesMinimumQuality(ctx, personaId, clamped)) return null;
  if (hasBannedGeneric(clamped)) return null;
  return clamped;
}

function hasBannedGeneric(text: string): boolean {
  const banned = [
    "양측 모두",
    "둘러싼 토론",
    "관점으로 말",
    "점진적 도입",
  ];
  return banned.some((b) => text.includes(b));
}

async function requestOpenAiTurn(
  client: OpenAI,
  model: string,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: buildDebatePrompt(ctx, personaId, history, round),
        },
      ],
      max_tokens: maxOutputTokens(personaId),
      temperature: 0.85,
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

async function generateWithProvider(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId: string,
  runtime: PersonaLlmRuntime,
): Promise<TurnResult> {
  let totalTokens = 0;
  let lastStopReason: LlmStopReason = null;
  const source = runtime.provider === "gemini" ? "gemini" : "openai";

  const result =
    runtime.provider === "gemini"
      ? await requestGeminiTurn(
          runtime.apiKey!,
          runtime.model,
          SYSTEM,
          buildDebatePrompt(ctx, personaId, history, round),
          maxOutputTokens(personaId),
        )
      : await requestOpenAiTurn(
          new OpenAI({ apiKey: runtime.apiKey }),
          runtime.model,
          ctx,
          personaId,
          history,
          round,
        );

  totalTokens += result.tokensUsed;

  if (result.stopReason) {
    lastStopReason = result.stopReason;
  } else if (result.content) {
    const polished = polishApiTurn(ctx, personaId, result.content);
    if (polished && validateResponse(ctx, personaId, polished).ok) {
      return {
        content: polished,
        tokensUsed: totalTokens,
        source,
        stopReason: null,
      };
    }
    if (polished && passesMinimumQuality(ctx, personaId, polished)) {
      return {
        content: polished,
        tokensUsed: totalTokens,
        source,
        stopReason: null,
      };
    }
  }

  const fallback = await generateMockTurn(
    ctx,
    personaId,
    history,
    round,
    debateId,
  );

  return {
    content: clampTurnContent(fallback, personaId),
    tokensUsed: totalTokens,
    source: totalTokens > 0 ? source : "engine",
    stopReason: lastStopReason,
  };
}

async function generateFreeTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId: string,
): Promise<TurnResult> {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    const runtime: PersonaLlmRuntime = {
      mode: "user_api",
      provider: "openai",
      apiKey: envKey,
      model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      maxTokenBudget: null,
      tokensUsed: 0,
    };
    return generateWithProvider(
      ctx,
      personaId,
      history,
      round,
      debateId,
      runtime,
    );
  }

  const content = await generateMockTurn(
    ctx,
    personaId,
    history,
    round,
    debateId,
  );

  return {
    content: clampTurnContent(content, personaId),
    tokensUsed: 0,
    source: "engine",
    stopReason: null,
  };
}

export async function generateEngineTurn(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId: string,
): Promise<TurnResult> {
  const ctx = parseTopic(topic);
  const content = await generateMockTurn(
    ctx,
    personaId,
    history,
    round,
    debateId,
  );
  return {
    content: clampTurnContent(content, personaId),
    tokensUsed: 0,
    source: "engine",
    stopReason: null,
  };
}

export async function generateDebateTurn(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId: string,
  runtime: PersonaLlmRuntime,
): Promise<TurnResult> {
  const ctx = parseTopic(topic);

  if (runtime.mode === "user_api" && runtime.apiKey) {
    return generateWithProvider(
      ctx,
      personaId,
      history,
      round,
      debateId,
      runtime,
    );
  }

  return generateFreeTurn(ctx, personaId, history, round, debateId);
}
