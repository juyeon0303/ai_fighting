import OpenAI from "openai";
import type { ApiProvider, DebateMessage, DebateReport, TimelineEvent } from "./types";
import { DEBATE_TURN_ORDER, normalizePersonaId, personaDisplayName, providerFromMessageSource, TURNS_PER_ROUND } from "./personas";
import { parseTopic } from "./topic-context";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { requestGeminiTurn } from "./gemini";

function speakerLabel(m: DebateMessage): string {
  return personaDisplayName(
    normalizePersonaId(m.personaId),
    providerFromMessageSource(m.llmSource),
  );
}

function namesSummary(messages: DebateMessage[]): string {
  return DEBATE_TURN_ORDER.map((id) => {
    const msg = messages.find((m) => normalizePersonaId(m.personaId) === id);
    const provider: ApiProvider = msg
      ? providerFromMessageSource(msg.llmSource)
      : "gemini";
    return personaDisplayName(id, provider);
  }).join("·");
}

function getRoundMessages(messages: DebateMessage[], round: number): DebateMessage[] {
  return messages.filter((m) => m.round === round);
}

function msgsForGenius(
  personaId: "atlas" | "cipher" | "ember",
  messages: DebateMessage[],
): DebateMessage[] {
  const legacy: Record<typeof personaId, string[]> = {
    atlas: ["atlas", "pro"],
    cipher: ["cipher", "con"],
    ember: ["ember", "neutral"],
  };
  return messages.filter((m) => legacy[personaId].includes(m.personaId));
}


function endReasonLabel(endReason?: string | null): string {
  switch (endReason) {
    case "token_budget":
      return "토큰 예산 소진";
    case "invalid_api_key":
      return "API 키 오류";
    case "api_quota":
      return "API 사용 한도 초과";
    case "max_rounds":
      return "토론 길이 한도";
    case "empty_turn":
      return "응답 생성 실패";
    default:
      return endReason ?? "알 수 없는 이유";
  }
}

async function callLLM(
  prompt: string,
  maxTokens = 400,
  options?: { apiKey?: string; model?: string; provider?: ApiProvider },
): Promise<string | null> {
  const key = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) return null;

  if (options?.provider === "gemini") {
    const result = await requestGeminiTurn(
      key,
      options.model ?? DEFAULT_GEMINI_MODEL,
      "JSON만 출력",
      prompt,
      maxTokens,
    );
    return result.content;
  }

  const client = new OpenAI({ apiKey: key });
  try {
    const response = await client.chat.completions.create({
      model: options?.model ?? DEFAULT_OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.6,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function buildOfflineRoundConsensus(
  topic: string,
  roundMessages: DebateMessage[],
  round: number,
): Omit<TimelineEvent, "id" | "createdAt"> {
  const atlas = msgsForGenius("atlas", roundMessages)[0];
  const cipher = msgsForGenius("cipher", roundMessages)[0];
  const ember = msgsForGenius("ember", roundMessages)[0];
  const debateId = roundMessages[0]!.debateId;
  const anchor = ember ?? cipher ?? atlas;

  const bits = [
    atlas ? `${speakerLabel(atlas)}: ${atlas.content.slice(0, 50)}` : null,
    cipher ? `${speakerLabel(cipher)}: ${cipher.content.slice(0, 50)}` : null,
    ember ? `${speakerLabel(ember)}: ${ember.content.slice(0, 50)}` : null,
  ].filter(Boolean);

  const summary =
    bits.length > 0
      ? bits.join(" · ")
      : `「${topic}」에 대한 중간 정리`;

  return {
    debateId,
    type: "consensus",
    title: "중간 합의",
    summary: summary.slice(0, 400),
    round,
    messageId: (anchor ?? roundMessages[0])!.id,
  };
}

function buildOfflineReport(
  topic: string,
  messages: DebateMessage[],
  timeline: TimelineEvent[],
  endReason?: string | null,
): Omit<DebateReport, "debateId" | "generatedAt"> {
  const ctx = parseTopic(topic);
  const atlasMsgs = msgsForGenius("atlas", messages);
  const cipherMsgs = msgsForGenius("cipher", messages);
  const emberMsgs = msgsForGenius("ember", messages);
  const consensusFromTimeline = timeline
    .filter((e) => e.type === "consensus")
    .map((e) => e.summary);

  if (messages.length === 0) {
    const why = endReasonLabel(endReason);
    return {
      title: `${topic} — 토론 종합 보고서`,
      executiveSummary: `토론이 시작되기 전 종료되어 발언이 0건입니다. 종료 사유: ${why}.`,
      consensusPoints: [],
      proArguments: [],
      conArguments: [],
      unresolvedIssues: [why],
      finalConclusion:
        "본격적인 논의가 진행되지 않아 승패나 우위를 판단할 수 없습니다.",
      recommendation:
        endReason === "invalid_api_key"
          ? "OpenAI API 키가 유효한지 확인하고 새 토론을 시작해 보세요."
          : endReason === "token_budget"
            ? "토큰 예산을 30,000 이상으로 설정한 뒤 다시 시도해 보세요."
            : "설정을 확인한 뒤 새 토론을 시작해 보세요.",
    };
  }

  const sideA = ctx.sideA;
  const sideB = ctx.sideB;
  const topicBrief =
    sideA && sideB
      ? `${sideA}와 ${sideB}`
      : ctx.displayTopic || topic;

  const lastEmber = emberMsgs[emberMsgs.length - 1]?.content;
  const finalConclusion =
    lastEmber ??
    (sideA && sideB
      ? `${sideA}와 ${sideB}에 단일 정답은 없고, 시각에 따라 해석이 갈린다.`
      : `${topic}에 대해 천재 3명이 각자 시각을 냈으나 아직 명확한 결론은 없다.`);

  return {
    title: `${topic} — 대화 종합 보고서`,
    executiveSummary: `총 ${messages.length}개 발언, 타임라인 ${timeline.length}건을 거치며 ${topicBrief}를 다뤘다. ${namesSummary(messages)}가 각자 시각으로 대화했다.`,
    consensusPoints:
      consensusFromTimeline.length > 0
        ? consensusFromTimeline
        : emberMsgs.slice(-2).map((m) => m.content.slice(0, 120)),
    proArguments: atlasMsgs.slice(-3).map((m) => m.content),
    conArguments: cipherMsgs.slice(-3).map((m) => m.content),
    unresolvedIssues:
      sideA && sideB
        ? [
            `${sideA}와 ${sideB}의 비교 기준(맛·가격·상황) 통일 필요`,
            "개인 취향 차이를 어떻게 반영할지 미정",
          ]
        : ["추가 근거와 사례가 더 필요함"],
    finalConclusion,
    recommendation:
      sideA && sideB
        ? `상황별로 ${sideA}와 ${sideB}를 골라 쓰는 게 현실적이다.`
        : "논거를 더 쌓은 뒤 다시 토론을 이어가는 것을 권한다.",
  };
}

export async function analyzeRoundForTimeline(
  topic: string,
  messages: DebateMessage[],
  round: number,
  options?: { apiKey?: string; model?: string; provider?: ApiProvider; tokenSaveMode?: boolean },
): Promise<Omit<TimelineEvent, "id" | "createdAt"> | null> {
  const roundMessages = getRoundMessages(messages, round);
  if (roundMessages.length < TURNS_PER_ROUND) return null;

  const debateId = roundMessages[0]!.debateId;
  const lastMessage = roundMessages[roundMessages.length - 1]!;

  const historyText = roundMessages
    .map((m) => `[${speakerLabel(m)}] ${m.content}`)
    .join("\n");

  const llmResult = await callLLM(
    `토론 주제: "${topic}"

최근 발언:
${historyText}

위 대화에서 천재 3명이 공통으로 인정할 수 있는 "중간 합의안"을 JSON으로 답하세요.
합의가 없으면 skip: true. 찬성/반대/중립 분류는 쓰지 마세요.

{"skip": false, "title": "짧은 제목", "summary": "1~3문장 합의안"}

JSON만 출력하세요.`,
    options?.tokenSaveMode ? 160 : 320,
    options,
  );

  if (llmResult) {
    try {
      const parsed = JSON.parse(llmResult.replace(/```json|```/g, "").trim());
      if (!parsed.skip && parsed.title && parsed.summary) {
        return {
          debateId,
          type: "consensus",
          title: parsed.title,
          summary: parsed.summary,
          round,
          messageId: lastMessage.id,
        };
      }
    } catch {
      // offline fallback below
    }
  }

  return buildOfflineRoundConsensus(topic, roundMessages, round);
}

export async function generateFinalReport(
  topic: string,
  messages: DebateMessage[],
  timeline: TimelineEvent[],
  options?: {
    endReason?: string | null;
    apiKey?: string;
    model?: string;
    provider?: ApiProvider;
  },
): Promise<Omit<DebateReport, "debateId" | "generatedAt">> {
  const historyText = messages
    .map((m) => `[${speakerLabel(m)}] ${m.content}`)
    .join("\n");

  const atlasName = personaDisplayName(
    "atlas",
    providerFromMessageSource(
      messages.find((m) => normalizePersonaId(m.personaId) === "atlas")?.llmSource,
    ),
  );
  const cipherName = personaDisplayName(
    "cipher",
    providerFromMessageSource(
      messages.find((m) => normalizePersonaId(m.personaId) === "cipher")?.llmSource,
    ),
  );

  const timelineText = timeline
    .map((e) => `- [${e.type}] ${e.title}: ${e.summary}`)
    .join("\n");

  const llmResult = await callLLM(
    `토론 주제: "${topic}"

전체 발언:
${historyText || "(없음)"}

타임라인 합의:
${timelineText || "(없음)"}

위 대화의 최종 보고서를 JSON으로 작성하세요. 찬성/반대/중립 분류 없이 천재별 관점으로 정리하세요.
{
  "title": "보고서 제목",
  "executiveSummary": "3~4문장 요약",
  "consensusPoints": ["합의점1", "합의점2"],
  "proArguments": ["${atlasName}(큰 그림) 핵심1", "${atlasName} 핵심2"],
  "conArguments": ["${cipherName}(논리) 핵심1", "${cipherName} 핵심2"],
  "unresolvedIssues": ["미해결 쟁점1"],
  "finalConclusion": "최종 결론 2~3문장",
  "recommendation": "실행 권고안 1~2문장"
}

JSON만 출력하세요.`,
    800,
    options,
  );

  if (llmResult) {
    try {
      const parsed = JSON.parse(llmResult.replace(/```json|```/g, "").trim());
      if (parsed.executiveSummary) {
        return {
          title: parsed.title ?? `${topic} — 토론 종합 보고서`,
          executiveSummary: parsed.executiveSummary,
          consensusPoints: parsed.consensusPoints ?? [],
          proArguments: parsed.proArguments ?? [],
          conArguments: parsed.conArguments ?? [],
          unresolvedIssues: parsed.unresolvedIssues ?? [],
          finalConclusion: parsed.finalConclusion ?? "",
          recommendation: parsed.recommendation ?? "",
        };
      }
    } catch {
      // fall through to offline report
    }
  }

  return buildOfflineReport(topic, messages, timeline, options?.endReason);
}
