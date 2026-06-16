import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import {
  buildDebateRetryHint,
  buildGeminiContents,
  buildOpenAiChatTurns,
  contradictsOwnRecentSpeech,
  driftsOffTopic,
  isLowQualityTurn,
  isSelfAnswerTurn,
  personaSystemInstruction,
  sanitizeTurnOutput,
  scrubLowQualityPhrases,
  topicUsesSearch,
} from "./debate-content";
import type { PersonaLlmRuntime } from "./debate-llm-config";
import { requestGeminiChat } from "./gemini";
import { parseTopic } from "./topic-context";
import {
  clampTurnContent,
  extractCompleteTurnText,
  isTurnComplete,
  maxOutputTokens,
} from "./debate-turn-budget";
import { isGodSpeaker } from "./personas";

export type LlmStopReason =
  | "auth"
  | "quota"
  | "rate_limit"
  | "missing_key"
  | null;

export interface TurnResult {
  content: string;
  tokensUsed: number;
  source: "openai" | "gemini";
  stopReason: LlmStopReason;
}

type ProviderTurnResult = {
  content: string | null;
  tokensUsed: number;
  stopReason: LlmStopReason;
  truncated: boolean;
};

const MAX_ATTEMPTS = 3;

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
  if (status === 402) return "quota";
  if (status === 429) return "rate_limit";
  return null;
}

function normalizeTurn(
  raw: string | null,
  personaId: PersonaId,
  tokenSaveMode: boolean,
  truncated: boolean,
): string {
  if (!raw?.trim()) return "";

  const cleaned = sanitizeTurnOutput(raw);
  const text = scrubLowQualityPhrases(cleaned);
  let out = clampTurnContent(text, personaId, tokenSaveMode);

  if (truncated || !isTurnComplete(out)) {
    out = extractCompleteTurnText(text);
    if (tokenSaveMode && out) {
      out = clampTurnContent(out, personaId, true);
    }
  }

  if (!out || !isTurnComplete(out)) return "";
  if (isLowQualityTurn(out)) return "";
  return out;
}

async function requestOpenAiChatTurn(
  client: OpenAI,
  model: string,
  system: string,
  turns: ReturnType<typeof buildOpenAiChatTurns>,
  personaId: PersonaId,
  tokenSaveMode: boolean,
): Promise<ProviderTurnResult> {
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
      temperature: tokenSaveMode ? 0.88 : 0.94,
      top_p: 0.92,
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content?.trim() ?? null,
      tokensUsed: usageTotal(response.usage),
      stopReason: null,
      truncated: choice?.finish_reason === "length",
    };
  } catch (error) {
    return {
      content: null,
      tokensUsed: 0,
      stopReason: mapApiError(error),
      truncated: false,
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
  incompleteRetry: boolean,
  contradictionRetry: boolean,
  selfAnswerRetry: boolean,
  driftRetry: boolean,
  googleSearch: boolean,
  temperature: number,
): Promise<ProviderTurnResult> {
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
        last.text = `${last.text}\n\n[다시] ${buildDebateRetryHint(qualityRetry, save, incompleteRetry, contradictionRetry, selfAnswerRetry, driftRetry)}`;
      }
    }
    const result = await requestGeminiChat(
      runtime.apiKey!,
      runtime.model,
      system,
      contents,
      maxOutputTokens(personaId, save),
      { googleSearch, temperature, fastFailRateLimit: true },
    );
    return {
      content: result.content,
      tokensUsed: result.tokensUsed,
      stopReason: result.stopReason,
      truncated: result.truncated,
    };
  }

  const turns = buildOpenAiChatTurns(topic, history, personaId, "openai", save);
  if (retry) {
    const last = turns[turns.length - 1];
    if (last?.role === "user") {
      last.text = `${last.text}\n\n[다시] ${buildDebateRetryHint(qualityRetry, save, incompleteRetry, contradictionRetry, selfAnswerRetry, driftRetry)}`;
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
  const ctx = parseTopic(topic);
  const source = runtime.provider === "gemini" ? "gemini" : "openai";
  const save = runtime.tokenSaveMode;
  const temperature = save ? 0.88 : 0.94;
  const googleSearch = !save && topicUsesSearch(ctx);

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
  let lastWasIncomplete = false;
  let lastWasContradiction = false;
  let lastWasSelfAnswer = false;
  let lastWasDrift = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await callProviderTurn(
      topic,
      runtime,
      system,
      history,
      personaId,
      attempt > 0,
      attempt >= 2,
      lastWasIncomplete,
      lastWasContradiction,
      lastWasSelfAnswer,
      lastWasDrift,
      googleSearch,
      temperature,
    );
    totalTokens += result.tokensUsed;

    if (result.stopReason) {
      lastStopReason = result.stopReason;
      break;
    }

    let content = normalizeTurn(
      result.content,
      personaId,
      save,
      result.truncated,
    );

    if (
      content &&
      contradictsOwnRecentSpeech(personaId, history, content, topic)
    ) {
      lastWasContradiction = true;
      lastWasSelfAnswer = false;
      lastWasDrift = false;
      lastWasIncomplete = false;
      content = "";
    }

    if (content && isSelfAnswerTurn(personaId, history, content)) {
      lastWasSelfAnswer = true;
      lastWasContradiction = false;
      lastWasDrift = false;
      lastWasIncomplete = false;
      content = "";
    }

    if (content && driftsOffTopic(topic, history, content)) {
      const last = history[history.length - 1];
      if (!(last && isGodSpeaker(last.personaId))) {
        lastWasDrift = true;
        lastWasContradiction = false;
        lastWasSelfAnswer = false;
        lastWasIncomplete = false;
        content = "";
      }
    }

    if (content) {
      return {
        content,
        tokensUsed: totalTokens,
        source,
        stopReason: null,
      };
    }

    if (!lastWasContradiction && !lastWasSelfAnswer && !lastWasDrift) {
      lastWasIncomplete = Boolean(result.content?.trim()) || result.truncated;
    }
  }

  return {
    content: "",
    tokensUsed: totalTokens,
    source,
    stopReason: lastStopReason,
  };
}
