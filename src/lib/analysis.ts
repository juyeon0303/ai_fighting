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

function personaSummaryBullets(
  msgs: DebateMessage[],
  maxItems = 3,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const msg of [...msgs].reverse()) {
    const raw = msg.content.trim().replace(/\s+/g, " ");
    if (raw.length < 10) continue;

    const key = raw.slice(0, 28);
    if (seen.has(key)) continue;
    seen.add(key);

    let line = raw;
    if (line.length > 110) {
      const cut = line.slice(0, 110);
      const breakAt = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("."));
      line = `${(breakAt > 40 ? cut.slice(0, breakAt) : cut).trim()}…`;
    }

    out.push(line);
    if (out.length >= maxItems) break;
  }

  return out;
}

function isBoilerplateReportText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    /추가 근거와 사례|다시 토론을 이어|논거를 더 쌓|비교 기준.*통일|개인 취향 차이|실행 권고|권한다\.?$/.test(
      t,
    ) ||
    t.length < 8
  );
}

function cleanReportItems(items: string[] | undefined): string[] {
  return (items ?? []).map((s) => s.trim()).filter((s) => !isBoilerplateReportText(s));
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
    case "api_rate_limit":
      return "API 호출 일시 제한";
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
      emberArguments: [],
      unresolvedIssues: [],
      finalConclusion:
        "본격적인 논의가 진행되지 않아 결론을 내리기 어렵습니다.",
      recommendation: "",
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
      : `${topic}에 대해 자·강·세가 각자 시각을 냈으나 아직 명확한 결론은 없다.`);

  return {
    title: `${topic} — 대화 종합 보고서`,
    executiveSummary: `총 ${messages.length}개 발언, 타임라인 ${timeline.length}건을 거치며 ${topicBrief}를 다뤘다. ${namesSummary(messages)}가 각자 시각으로 대화했다.`,
    consensusPoints: cleanReportItems(
      consensusFromTimeline.length > 0
        ? consensusFromTimeline
        : personaSummaryBullets(emberMsgs, 2),
    ),
    proArguments: personaSummaryBullets(atlasMsgs, 3),
    conArguments: personaSummaryBullets(cipherMsgs, 3),
    emberArguments: personaSummaryBullets(emberMsgs, 3),
    unresolvedIssues: [],
    finalConclusion,
    recommendation: "",
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

위 대화에서 자·강·세가 공통으로 인정할 수 있는 "중간 합의안"을 JSON으로 답하세요.
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
  const emberName = personaDisplayName(
    "ember",
    providerFromMessageSource(
      messages.find((m) => normalizePersonaId(m.personaId) === "ember")?.llmSource,
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

위 대화의 최종 보고서를 JSON으로 작성하세요.
- 찬성/반대/중립 분류 금지. ${atlasName}·${cipherName}·${emberName} 세 사람 관점을 각각 정리.
- 발언문 그대로 복사 금지. 각 항목은 한 줄 요약(재서술).
- "다시 토론을 권한다", "추가 근거가 필요" 같은 형식적·빈말 금지.
- unresolvedIssues, recommendation은 빈 배열/빈 문자열로 두세요.
{
  "title": "보고서 제목",
  "executiveSummary": "3~4문장 요약",
  "consensusPoints": ["실제로 맞춰진 점만, 없으면 []"],
  "proArguments": ["${atlasName} 핵심1", "${atlasName} 핵심2"],
  "conArguments": ["${cipherName} 핵심1", "${cipherName} 핵심2"],
  "emberArguments": ["${emberName} 핵심1", "${emberName} 핵심2"],
  "unresolvedIssues": [],
  "finalConclusion": "최종 결론 2~3문장",
  "recommendation": ""
}

JSON만 출력하세요.`,
    800,
    options,
  );

  if (llmResult) {
    try {
      const parsed = JSON.parse(llmResult.replace(/```json|```/g, "").trim());
      if (parsed.executiveSummary) {
        const recommendation = String(parsed.recommendation ?? "").trim();
        return {
          title: parsed.title ?? `${topic} — 토론 종합 보고서`,
          executiveSummary: parsed.executiveSummary,
          consensusPoints: cleanReportItems(parsed.consensusPoints),
          proArguments: cleanReportItems(parsed.proArguments),
          conArguments: cleanReportItems(parsed.conArguments),
          emberArguments: cleanReportItems(parsed.emberArguments),
          unresolvedIssues: cleanReportItems(parsed.unresolvedIssues),
          finalConclusion: parsed.finalConclusion ?? "",
          recommendation: isBoilerplateReportText(recommendation)
            ? ""
            : recommendation,
        };
      }
    } catch {
      // fall through to offline report
    }
  }

  return buildOfflineReport(topic, messages, timeline, options?.endReason);
}
