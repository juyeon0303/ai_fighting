import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  buildDebatePrompt,
  generateMockTurn,
  validateResponse,
} from "./debate-content";
import type { PersonaLlmRuntime } from "./debate-llm-config";
import { DEBATE_STYLE } from "./debate-style";
import { requestGeminiTurn } from "./gemini";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";
import { parseTopic } from "./topic-context";

const RETRY_HINT =
  "\n\n[재작성 필수] 방금 답은 너무 딱딱하거나 뻔함. 격식체(습니다/해주세요) 금지. 주제에 맞는 구체적 사실·논리로 다시 써.";

const SYSTEM = `한국어 토론 AI. 무난하고 자연스러운 말투. 격식체·슬랭·억지 유머 금지. ${DEBATE_STYLE}`;

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

async function requestOpenAiTurn(
  client: OpenAI,
  model: string,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  retryHint = "",
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: buildDebatePrompt(ctx, personaId, history, round) + retryHint,
        },
      ],
      max_tokens: 300,
      temperature: 0.92,
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
  const source = runtime.provider === "gemini" ? "gemini" : "openai";

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      buildDebatePrompt(ctx, personaId, history, round) +
      (attempt === 0 ? "" : RETRY_HINT);

    const result =
      runtime.provider === "gemini"
        ? await requestGeminiTurn(
            runtime.apiKey!,
            runtime.model,
            SYSTEM,
            prompt,
          )
        : await requestOpenAiTurn(
            new OpenAI({ apiKey: runtime.apiKey }),
            runtime.model,
            ctx,
            personaId,
            history,
            round,
            attempt === 0 ? "" : RETRY_HINT,
          );

    totalTokens += result.tokensUsed;

    if (result.stopReason) {
      break;
    }

    if (!result.content) continue;

    const validation = validateResponse(ctx, personaId, result.content);
    if (validation.ok) {
      return {
        content: result.content,
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
    content: fallback,
    tokensUsed: totalTokens,
    source: "engine",
    stopReason: null,
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
    content,
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
    content,
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
