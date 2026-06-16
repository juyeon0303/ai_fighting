import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import {
  buildDebateRetryHint,
  buildGeminiContents,
  buildOpenAiChatTurns,
  isLowQualityTurn,
  personaSystemInstruction,
  sanitizeTurnOutput,
  scrubLowQualityPhrases,
} from "./debate-content";
import type { PersonaLlmRuntime } from "./debate-llm-config";
import { requestGeminiChat } from "./gemini";
import { parseTopic } from "./topic-context";
import {
  clampTurnContent,
  isIncompleteTurn,
  maxOutputTokens,
} from "./debate-turn-budget";

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

function normalizeTurn(
  raw: string | null,
  personaId: PersonaId,
  tokenSaveMode: boolean,
): string {
  if (!raw?.trim()) return "";
  const cleaned = sanitizeTurnOutput(raw);
  const scrubbed = scrubLowQualityPhrases(cleaned);
  const clamped = clampTurnContent(scrubbed, personaId, tokenSaveMode);
  if (isIncompleteTurn(clamped)) return "";
  if (isLowQualityTurn(clamped)) return "";
  return clamped;
}

async function requestOpenAiChatTurn(
  client: OpenAI,
  model: string,
  system: string,
  turns: ReturnType<typeof buildOpenAiChatTurns>,
  personaId: PersonaId,
  tokenSaveMode: boolean,
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        ...turns.map((t) => ({
          role: t.role as "user" | "assistant",
          content: t.text,
        })),
      ],
      max_tokens: maxOutputTokens(personaId, tokenSaveMode),
      temperature: tokenSaveMode ? 0.72 : 0.82,
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
  topic: string,
  runtime: PersonaLlmRuntime,
  system: string,
  history: DebateMessage[],
  personaId: PersonaId,
  retry: boolean,
  qualityRetry: boolean,
): Promise<{ content: string | null; tokensUsed: number; stopReason: LlmStopReason }> {
  const provider = runtime.provider;
  const save = runtime.tokenSaveMode;

  if (provider === "gemini") {
    const contents = buildGeminiContents(
      topic,
      history,
      personaId,
      "gemini",
      save,
    );
    if (retry) {
      const last = contents[contents.length - 1];
      if (last?.role === "user") {
        last.text = `${last.text}\n\n[다시] ${buildDebateRetryHint(qualityRetry, save)}`;
      }
    }
    return requestGeminiChat(
      runtime.apiKey!,
      runtime.model,
      system,
      contents,
      maxOutputTokens(personaId, save),
      { googleSearch: true },
    );
  }

  const turns = buildOpenAiChatTurns(topic, history, personaId, "openai", save);
  if (retry) {
    const last = turns[turns.length - 1];
    if (last?.role === "user") {
      last.text = `${last.text}\n\n[다시] ${buildDebateRetryHint(qualityRetry, save)}`;
    }
  }
  return requestOpenAiChatTurn(
    new OpenAI({ apiKey: runtime.apiKey }),
    runtime.model,
    system,
    turns,
    personaId,
    save,
  );
}

export async function generateDebateTurn(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  _round: number,
  _debateId: string,
  runtime: PersonaLlmRuntime,
): Promise<TurnResult> {
  parseTopic(topic);
  const source = runtime.provider === "gemini" ? "gemini" : "openai";
  const save = runtime.tokenSaveMode;

  if (!runtime.apiKey) {
    return {
      content: "",
      tokensUsed: 0,
      source,
      stopReason: "missing_key",
    };
  }

  const system = personaSystemInstruction(topic, personaId, source, save);
  let totalTokens = 0;
  let lastStopReason: LlmStopReason = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await callProviderTurn(
      topic,
      runtime,
      system,
      history,
      personaId,
      attempt > 0,
      attempt >= 1,
    );
    totalTokens += result.tokensUsed;

    if (result.stopReason) {
      lastStopReason = result.stopReason;
      break;
    }

    const content = normalizeTurn(result.content, personaId, save);
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
