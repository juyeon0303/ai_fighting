import OpenAI from "openai";
import type { DebateMessage, DebateReport, TimelineEvent } from "./types";
import { getPersona } from "./personas";
import { parseTopic } from "./topic-context";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";

const CONFLICT_KEYWORDS = ["반박", "틀렸", "동의할 수 없", "문제", "위험", "우려"];
const CONSENSUS_KEYWORDS = ["합의", "공감", "동의", "중도", "절충", "조건부", "공통"];

function getRoundMessages(messages: DebateMessage[], round: number): DebateMessage[] {
  return messages.filter((m) => m.round === round);
}

function detectConflict(messages: DebateMessage[]): boolean {
  const pro = messages.find((m) => m.personaId === "pro");
  const con = messages.find((m) => m.personaId === "con");
  if (!pro || !con) return false;

  const combined = `${pro.content} ${con.content}`;
  return CONFLICT_KEYWORDS.some((k) => combined.includes(k));
}

function detectConsensusHint(messages: DebateMessage[]): boolean {
  const neutral = messages.find((m) => m.personaId === "neutral");
  const moderator = messages.find((m) => m.personaId === "moderator");
  const combined = `${neutral?.content ?? ""} ${moderator?.content ?? ""}`;
  return CONSENSUS_KEYWORDS.some((k) => combined.includes(k));
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
      return "최대 라운드 도달";
    case "empty_turn":
      return "응답 생성 실패";
    default:
      return endReason ?? "알 수 없는 이유";
  }
}

async function callLLM(
  prompt: string,
  maxTokens = 400,
  apiKey?: string,
  model = DEFAULT_OPENAI_MODEL,
): Promise<string | null> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) return null;

  const client = new OpenAI({ apiKey: key });
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.6,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function buildOfflineReport(
  topic: string,
  messages: DebateMessage[],
  timeline: TimelineEvent[],
  endReason?: string | null,
): Omit<DebateReport, "debateId" | "generatedAt"> {
  const ctx = parseTopic(topic);
  const proMsgs = messages.filter((m) => m.personaId === "pro");
  const conMsgs = messages.filter((m) => m.personaId === "con");
  const neutralMsgs = messages.filter((m) => m.personaId === "neutral");
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

  const lastNeutral = neutralMsgs[neutralMsgs.length - 1]?.content;
  const finalConclusion =
    lastNeutral ??
    (sideA && sideB
      ? `${sideA}와 ${sideB} 중 단일 정답은 없고, 취향·상황에 따라 선택이 갈린다.`
      : `${topic}에 대해 찬반 논거가 교차했으나 아직 명확한 결론은 없다.`);

  return {
    title: `${topic} — 토론 종합 보고서`,
    executiveSummary: `총 ${messages.length}개 발언, 타임라인 ${timeline.length}건을 거치며 ${topicBrief}를 다뤘다. 찬반 양측이 각자 근거를 제시했고, 중립 AI가 균형을 정리했다.`,
    consensusPoints:
      consensusFromTimeline.length > 0
        ? consensusFromTimeline
        : neutralMsgs.slice(-2).map((m) => m.content.slice(0, 120)),
    proArguments: proMsgs.slice(-3).map((m) => m.content),
    conArguments: conMsgs.slice(-3).map((m) => m.content),
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
  options?: { apiKey?: string; model?: string },
): Promise<Omit<TimelineEvent, "id" | "createdAt"> | null> {
  const roundMessages = getRoundMessages(messages, round);
  if (roundMessages.length < 4) return null;

  const debateId = roundMessages[0].debateId;
  const lastMessage = roundMessages[roundMessages.length - 1];

  if (detectConflict(roundMessages) && round % 3 === 0) {
    return {
      debateId,
      type: "conflict",
      title: `라운드 ${round} — 격돌`,
      summary: "찬성·반대 측의 핵심 주장이 정면으로 충돌했습니다.",
      round,
      messageId: lastMessage.id,
    };
  }

  const hasConsensusHint = detectConsensusHint(roundMessages);
  const shouldAnalyze = hasConsensusHint || round % 2 === 0;

  if (!shouldAnalyze) return null;

  const historyText = roundMessages
    .map((m) => `[${getPersona(m.personaId).name}] ${m.content}`)
    .join("\n");

  const llmResult = await callLLM(
    `토론 주제: "${topic}"
라운드 ${round} 발언:
${historyText}

위 라운드에서 AI들 사이에 형성된 "중간 합의안" 또는 "전환점"이 있으면 JSON으로 답하세요.
없으면 {"skip": true} 만 출력.

있으면:
{"skip": false, "type": "consensus" 또는 "turning_point", "title": "짧은 제목", "summary": "1~2문장 요약"}

JSON만 출력하세요.`,
    200,
    options?.apiKey,
    options?.model,
  );

  if (llmResult) {
    try {
      const parsed = JSON.parse(llmResult.replace(/```json|```/g, "").trim());
      if (!parsed.skip && parsed.title && parsed.summary) {
        return {
          debateId,
          type: parsed.type === "turning_point" ? "turning_point" : "consensus",
          title: parsed.title,
          summary: parsed.summary,
          round,
          messageId: lastMessage.id,
        };
      }
    } catch {
      // no generic mock fallback
    }
  }

  if (hasConsensusHint && neutralMsgsFrom(roundMessages)) {
    const neutral = roundMessages.find((m) => m.personaId === "neutral");
    if (neutral) {
      return {
        debateId,
        type: "consensus",
        title: `라운드 ${round} — 중립 정리`,
        summary: neutral.content.slice(0, 120),
        round,
        messageId: lastMessage.id,
      };
    }
  }

  return null;
}

function neutralMsgsFrom(messages: DebateMessage[]): boolean {
  return messages.some((m) => m.personaId === "neutral");
}

export async function generateFinalReport(
  topic: string,
  messages: DebateMessage[],
  timeline: TimelineEvent[],
  options?: {
    endReason?: string | null;
    apiKey?: string;
    model?: string;
  },
): Promise<Omit<DebateReport, "debateId" | "generatedAt">> {
  const historyText = messages
    .map((m) => `[${getPersona(m.personaId).name}] ${m.content}`)
    .join("\n");

  const timelineText = timeline
    .map((e) => `- [${e.type}] ${e.title}: ${e.summary}`)
    .join("\n");

  const llmResult = await callLLM(
    `토론 주제: "${topic}"

전체 발언:
${historyText || "(없음)"}

타임라인 합의/전환점:
${timelineText || "(없음)"}

위 토론의 최종 보고서를 JSON으로 작성하세요. 주제(음식 비교, 찬반 등)에 맞는 구체적 내용만 쓰고, 정책·파일럿·점진적 도입 같은 일반론은 금지.
{
  "title": "보고서 제목",
  "executiveSummary": "3~4문장 요약",
  "consensusPoints": ["합의점1", "합의점2"],
  "proArguments": ["찬성 핵심 논거1", "찬성 핵심 논거2"],
  "conArguments": ["반대 핵심 논거1", "반대 핵심 논거2"],
  "unresolvedIssues": ["미해결 쟁점1"],
  "finalConclusion": "최종 결론 2~3문장",
  "recommendation": "실행 권고안 1~2문장"
}

JSON만 출력하세요.`,
    800,
    options?.apiKey,
    options?.model,
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
