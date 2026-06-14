import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  apiPolishRejectHint,
  buildDebatePrompt,
  generateMockTurn,
  polishApiResponse,
} from "./debate-content";
import type { PersonaLlmRuntime } from "./debate-llm-config";
import { requestGeminiTurn } from "./gemini";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";
import { parseTopic } from "./topic-context";
import { getDebateSources } from "./debate-sources";
import {
  clampTurnContent,
  maxOutputTokens,
} from "./debate-turn-budget";

const SYSTEM =
  "천재 친구 3명이 주제 수다. 무난한 반말 1~2문장. 찬성/반대/중립 입장 금지. 해요체·논문체 금지.";

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

async function tryPolishApiTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  raw: string,
  runtime: PersonaLlmRuntime,
  prompt: string,
): Promise<{ content: string | null; tokensUsed: number }> {
  const polished = polishApiResponse(ctx, personaId, history, raw);
  if (polished) {
    return { content: polished, tokensUsed: 0 };
  }

  const hint = apiPolishRejectHint(ctx, personaId, history, raw);
  if (!hint || runtime.provider !== "gemini") {
    return { content: null, tokensUsed: 0 };
  }

  const retry = await requestGeminiTurn(
    runtime.apiKey!,
    runtime.model,
    SYSTEM,
    `${prompt}\n\n[다시] ${hint}. 친구 반말 1~2문장.`,
    maxOutputTokens(personaId),
  );

  if (!retry.content) {
    return { content: null, tokensUsed: retry.tokensUsed };
  }

  const retryPolished = polishApiResponse(
    ctx,
    personaId,
    history,
    retry.content,
  );
  return {
    content: retryPolished,
    tokensUsed: retry.tokensUsed,
  };
}

async function requestOpenAiTurn(
  client: OpenAI,
  model: string,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: Awaited<ReturnType<typeof getDebateSources>>,
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: buildDebatePrompt(ctx, personaId, history, round, sources),
        },
      ],
      max_tokens: maxOutputTokens(personaId),
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
  let lastStopReason: LlmStopReason = null;
  const source = runtime.provider === "gemini" ? "gemini" : "openai";

  const sources = await getDebateSources(ctx);
  const prompt = buildDebatePrompt(
    ctx,
    personaId,
    history,
    round,
    sources,
  );

  const result =
    runtime.provider === "gemini"
      ? await requestGeminiTurn(
          runtime.apiKey!,
          runtime.model,
          SYSTEM,
          prompt,
          maxOutputTokens(personaId),
        )
      : await requestOpenAiTurn(
          new OpenAI({ apiKey: runtime.apiKey }),
          runtime.model,
          ctx,
          personaId,
          history,
          round,
          sources,
        );

  totalTokens += result.tokensUsed;

  if (result.stopReason) {
    lastStopReason = result.stopReason;
  } else if (result.content) {
    const polished = await tryPolishApiTurn(
      ctx,
      personaId,
      history,
      result.content,
      runtime,
      prompt,
    );
    totalTokens += polished.tokensUsed;

    if (polished.content) {
      return {
        content: polished.content,
        tokensUsed: totalTokens,
        source,
        stopReason: null,
      };
    }
    console.warn(
      `[llm] ${source} output rejected — engine fallback`,
      personaId,
      apiPolishRejectHint(ctx, personaId, history, result.content),
    );
  } else if (!result.stopReason) {
    console.warn(`[llm] ${source} empty response — engine fallback`, personaId);
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
    source: "engine",
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
