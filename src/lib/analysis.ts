import OpenAI from "openai";
import type { DebateMessage, DebateReport, TimelineEvent } from "./types";
import { getPersona } from "./personas";

const MOCK_CONSENSUS = [
  {
    title: "점진적 도입 합의",
    summary: "급진적 변화보다 단계적 시행과 검증이 필요하다는 데 공감대가 형성되었습니다.",
  },
  {
    title: "리스크 관리 프레임워크",
    summary: "찬반 양측 모두 사전 규제와 모니터링 체계 마련의 필요성에 동의했습니다.",
  },
  {
    title: "이해관계자 참여",
    summary: "정책 결정에 다양한 이해관계자의 목소리를 반영해야 한다는 중간 합의안이 나왔습니다.",
  },
  {
    title: "조건부 수용",
    summary: "특정 조건(투명성, 안전장치)이 충족될 경우 제한적 수용이 가능하다는 절충안이 제시되었습니다.",
  },
  {
    title: "추가 연구 필요",
    summary: "현 시점에서 성급한 결론보다 추가 데이터 수집과 연구가 필요하다는 데 의견이 모였습니다.",
  },
];

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

function getMockConsensus(round: number): { title: string; summary: string } {
  return MOCK_CONSENSUS[(round / 2 - 1) % MOCK_CONSENSUS.length];
}

async function callLLM(prompt: string, maxTokens = 400): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.6,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function analyzeRoundForTimeline(
  topic: string,
  messages: DebateMessage[],
  round: number,
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
      // fall through to mock
    }
  }

  if (round % 2 !== 0) return null;

  const mock = getMockConsensus(round);
  return {
    debateId,
    type: "consensus",
    title: mock.title,
    summary: mock.summary,
    round,
    messageId: lastMessage.id,
  };
}

export async function generateFinalReport(
  topic: string,
  messages: DebateMessage[],
  timeline: TimelineEvent[],
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
${historyText}

타임라인 합의/전환점:
${timelineText || "(없음)"}

위 토론의 최종 보고서를 JSON으로 작성하세요:
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
      // fall through
    }
  }

  const proMsgs = messages.filter((m) => m.personaId === "pro");
  const conMsgs = messages.filter((m) => m.personaId === "con");
  const consensusFromTimeline = timeline
    .filter((e) => e.type === "consensus")
    .map((e) => e.summary);

  return {
    title: `${topic} — 토론 종합 보고서`,
    executiveSummary: `총 ${messages.length}개 발언, ${timeline.length}개 타임라인 이벤트를 거친 토론입니다. 찬반 양측의 핵심 논거가 교차했으며, 중간 합의안 ${consensusFromTimeline.length}건이 도출되었습니다.`,
    consensusPoints:
      consensusFromTimeline.length > 0
        ? consensusFromTimeline
        : ["점진적 도입과 단계적 검증 필요", "리스크 관리 체계 마련 필요"],
    proArguments: proMsgs.slice(-3).map((m) => m.content.slice(0, 80)),
    conArguments: conMsgs.slice(-3).map((m) => m.content.slice(0, 80)),
    unresolvedIssues: ["장기적 영향에 대한 추가 검증 필요", "구체적 실행 일정 미확정"],
    finalConclusion:
      "즉각적 찬반이 아닌, 조건부·단계적 접근이 가장 합리적인 결론으로 도출되었습니다.",
    recommendation:
      "파일럿 프로그램을 통한 소규모 시범 적용 후, 데이터 기반으로 확대 여부를 결정할 것을 권고합니다.",
  };
}
