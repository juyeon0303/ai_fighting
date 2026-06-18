import type { ApiProvider, DebateMessage, DebateReport } from "./types";
import {
  DEBATE_TURN_ORDER,
  GOD_DISPLAY_NAME,
  isGodSpeaker,
  normalizePersonaId,
  personaDisplayName,
  providerFromMessageSource,
} from "./personas";
import { parseTopic } from "./topic-context";

const MIN_MESSAGES_FOR_FULL_REPORT = 9;
const PERSONA_BULLET_MAX = 2;

function speakerLabel(m: DebateMessage): string {
  if (isGodSpeaker(m.personaId)) return GOD_DISPLAY_NAME;
  return personaDisplayName(
    normalizePersonaId(m.personaId),
    providerFromMessageSource(m.llmSource),
  );
}

function namesSummary(messages: DebateMessage[]): string {
  return DEBATE_TURN_ORDER.map((id) => {
    const msg = messages.find(
      (m) => !isGodSpeaker(m.personaId) && normalizePersonaId(m.personaId) === id,
    );
    const provider: ApiProvider = msg
      ? providerFromMessageSource(msg.llmSource)
      : "gemini";
    return personaDisplayName(id, provider);
  }).join("·");
}

function personaProviderFor(
  personaId: "atlas" | "cipher" | "ember",
  messages: DebateMessage[],
): ApiProvider {
  const msg = messages.find(
    (m) =>
      !isGodSpeaker(m.personaId) &&
      normalizePersonaId(m.personaId) === personaId,
  );
  return msg ? providerFromMessageSource(msg.llmSource) : "gemini";
}

function isBoilerplateReportText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    /추가 근거와 사례|다시 토론을 이어|논거를 더 쌓|비교 기준.*통일|개인 취향 차이|실행 권고|권한다\.?$/.test(
      t,
    ) || t.length < 8
  );
}

function isWishyWashyConclusion(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 10) return true;
  return (
    (/(?:양쪽|둘\s*다|모두|각(?:기|자)|서로\s*다른|각각의?\s*매력|즐거움을\s*준|확인(?:했|하)|도달(?:했|하))/.test(
      t,
    ) &&
      !/(?:낫|우위|선|추천|pick|이긴|압도|손|탑|정답|결론(?:은|이)\s*[:：]?\s*\S{2,})/i.test(
        t,
      )) ||
    /(?:단일\s*정답|정답\s*없|시각에\s*따라|취향\s*차|상황(?:에)?\s*따라|애매|중립|균형\s*잡|양보\s*없)/.test(
      t,
    ) ||
    (/(?:운영\s*방식|매력|다양|공존|조화)/.test(t) &&
      !/(?:낫|우위|선택|추천|손)/.test(t))
  );
}

function clipLine(text: string, max = 96): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const breakAt = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("."));
  return `${(breakAt > 40 ? cut.slice(0, breakAt) : cut).trim()}…`;
}

function sideAdvocacyScore(messages: DebateMessage[], side: string): number {
  const needle = side.trim();
  if (!needle) return 0;
  const short = needle.slice(0, Math.min(4, needle.length));
  let score = 0;

  for (const m of messages) {
    const t = m.content;
    if (!t.includes(needle) && !t.includes(short)) continue;
    if (/(?:낫|우위|강하|좋|쎄|압도|독보|탑|1\s*등|이긴|선택|추천|pick|손(?:에)?)/i.test(t)) {
      score += 2;
    }
    if (/(?:약|별로|아닌|틀렸|억지|하차|질려|실패)/.test(t)) {
      score -= 1;
    }
  }

  return score;
}

function extractDecisiveLine(messages: DebateMessage[]): string | null {
  const decisiveRe =
    /(?:결국|따지면|솔직히|정리(?:하)?면|(?:낫|좋|강|쎄|우위|이기|압도|선택|pick|추천)|\S+(?:가|이)\s+(?:더\s*)?(?:낫|좋|강|쎄|우위))/i;
  const hedgeRe =
    /(?:양쪽|둘\s*다|모두|각(?:기|자)|취향|정답\s*없|매력|확인(?:했|하)|도달(?:했|하)|운영\s*방식)/;

  for (const m of [...messages].reverse()) {
    if (isGodSpeaker(m.personaId)) continue;
    const parts = m.content
      .split(/(?<=[.!?…]|다|임|함|요|지|야|어|냐|네|거야|같아|거든|잖아|래|줘|ㅋ|ㅎ)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (let i = parts.length - 1; i >= 0; i--) {
      const line = parts[i]!;
      if (line.length < 14 || hedgeRe.test(line)) continue;
      if (decisiveRe.test(line)) {
        return clipLine(line, 180);
      }
    }
  }

  return null;
}

function buildDecisiveConclusion(
  topic: string,
  messages: DebateMessage[],
  shortDebate: boolean,
): string {
  const ctx = parseTopic(topic);
  const line = extractDecisiveLine(messages);
  if (line && !isWishyWashyConclusion(line)) {
    return shortDebate
      ? `지금까지 논의 기준으로 보면, ${line}`
      : line;
  }

  const { sideA, sideB, debateQuestion, mode } = ctx;

  if (sideA && sideB) {
    const scoreA = sideAdvocacyScore(messages, sideA);
    const scoreB = sideAdvocacyScore(messages, sideB);
    if (scoreA > scoreB) {
      return shortDebate
        ? `초기 논의만 놓고도 ${sideA} 쪽 논거가 ${sideB}보다 조금 더 설득력 있다.`
        : `이 대화 기준으로는 ${sideA}가 ${sideB}보다 한 수 위다.`;
    }
    if (scoreB > scoreA) {
      return shortDebate
        ? `초기 논의만 놓고도 ${sideB} 쪽 논거가 ${sideA}보다 조금 더 설득력 있다.`
        : `이 대화 기준으로는 ${sideB}가 ${sideA}보다 한 수 위다.`;
    }
    return shortDebate
      ? `${sideA}와 ${sideB} 중 하나를 고르라면, 지금까지 나온 말은 ${sideA} 쪽에 기울어 있다.`
      : `${sideA}와 ${sideB} 중 하나를 고르라면, 후반 논거 기준 ${sideA} 쪽이 더 납득된다.`;
  }

  if (mode === "proposition") {
    const yes = messages.filter((m) =>
      /(?:찬성|맞(?:는|아|다)|해야|동의|긍정|가능)/.test(m.content),
    ).length;
    const no = messages.filter((m) =>
      /(?:반대|아닌|틀렸|안\s*(?:돼|됨|해)|부정|불가)/.test(m.content),
    ).length;
    if (yes > no) {
      return shortDebate
        ? `「${debateQuestion}」— 지금까지 흐름만 보면 찬성 쪽이 앞선다.`
        : `「${debateQuestion}」— 대화 흐름상 찬성 쪽이 더 설득력 있다.`;
    }
    if (no > yes) {
      return shortDebate
        ? `「${debateQuestion}」— 지금까지 흐름만 보면 반대 쪽이 앞선다.`
        : `「${debateQuestion}」— 대화 흐름상 반대 쪽이 더 설득력 있다.`;
    }
  }

  const lastAi = [...messages]
    .reverse()
    .find((m) => !isGodSpeaker(m.personaId));
  const lastText = lastAi?.content.trim();
  if (lastText && lastText.length >= 16 && !isWishyWashyConclusion(lastText)) {
    const clipped = clipLine(lastText, 180);
    return shortDebate
      ? `아직 논의 초반이지만, 마지막 흐름은 "${clipped}" 쪽에 기울어 있다.`
      : clipped;
  }

  const names = namesSummary(messages);
  return shortDebate
    ? `「${ctx.topic}」— 발언이 적지만 ${names} 중 후반 발언 방향을 잠정 결론으로 본다.`
    : `「${ctx.topic}」— ${names} 대화를 종합하면, 후반에 나온 주장 쪽이 더 납득된다.`;
}

function cleanReportItems(items: string[] | undefined): string[] {
  return (items ?? [])
    .map((s) => s.trim())
    .filter((s) => !isBoilerplateReportText(s));
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
    case "manual":
      return "사용자가 토론을 중간에 종료했다.";
    case "token_budget":
      return "토큰 예산 소진으로 토론이 종료되었다.";
    case "invalid_api_key":
      return "API 키 오류로 토론이 종료되었다.";
    case "api_quota":
      return "API 사용 한도 초과로 토론이 종료되었다.";
    case "api_rate_limit":
      return "API 호출 제한으로 토론이 잠시 멈춘 뒤 종료되었다.";
    case "max_rounds":
      return "토론 길이 한도에 도달해 종료되었다.";
    case "empty_turn":
      return "응답 생성 실패로 토론이 종료되었다.";
    default:
      return "토론이 종료된 시점의 논의를 바탕으로 정리했다.";
  }
}

function reportTitle(topic: string): string {
  return `「${topic}」 토론 종합 보고서`;
}

function personaReportLines(
  personaId: "atlas" | "cipher" | "ember",
  messages: DebateMessage[],
): string[] {
  const name = personaDisplayName(
    personaId,
    personaProviderFor(personaId, messages),
  );
  const msgs = msgsForGenius(personaId, messages);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const msg of [...msgs].reverse()) {
    const raw = msg.content.replace(/\s+/g, " ").trim();
    if (raw.length < 10) continue;
    const key = raw.slice(0, 32);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${name} — ${clipLine(raw)}`);
    if (out.length >= PERSONA_BULLET_MAX) break;
  }

  return out;
}

function findConsensusPoints(messages: DebateMessage[]): string[] {
  const agreementRe =
    /(?:인정|맞(?:긴|아)|ㅇㅇ|그치|동의|같은\s*생각|그건\s*맞)/;
  const points: string[] = [];

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]!;
    const cur = messages[i]!;
    if (isGodSpeaker(cur.personaId) || isGodSpeaker(prev.personaId)) continue;
    if (normalizePersonaId(cur.personaId) === normalizePersonaId(prev.personaId)) {
      continue;
    }
    if (!agreementRe.test(cur.content)) continue;

    const snippet = clipLine(prev.content, 72);
    if (snippet.length < 12) continue;
    points.push(`${snippet} — 이 지점에 공감·동의가 있었다.`);
    if (points.length >= 2) break;
  }

  return points;
}

function buildExecutiveSummary(
  topic: string,
  messages: DebateMessage[],
  endReason?: string | null,
): string {
  const ctx = parseTopic(topic);
  const names = namesSummary(messages);
  const topicBrief =
    ctx.sideA && ctx.sideB
      ? `${ctx.sideA}와 ${ctx.sideB}`
      : ctx.topic;
  const shortDebate = messages.length < MIN_MESSAGES_FOR_FULL_REPORT;
  const endNote = endReasonLabel(endReason);

  const parts = [
    `「${topic}」를 주제로 ${names}가 원탁에서 대화했다.`,
    `총 ${messages.length}건의 발언이 기록되었다.`,
    endNote,
  ];

  if (shortDebate) {
    parts.push(
      "발언 수가 많지 않아, 중간 논의 기준의 잠정 정리다.",
    );
  }

  parts.push(
    `${topicBrief}를 놓고 세 사람의 관점과 종합 결론을 아래에 정리했다.`,
  );

  return parts.join(" ");
}

/** LLM 없이 항상 동일 템플릿·톤으로 보고서 생성 */
export function buildStructuredReport(
  topic: string,
  messages: DebateMessage[],
  endReason?: string | null,
): Omit<DebateReport, "debateId" | "generatedAt"> {
  if (messages.length === 0) {
    return {
      title: reportTitle(topic),
      executiveSummary: `「${topic}」 토론이 시작되기 전 종료되어 발언이 없다. ${endReasonLabel(endReason)}`,
      consensusPoints: [],
      proArguments: [],
      conArguments: [],
      emberArguments: [],
      unresolvedIssues: [],
      finalConclusion:
        "본격적인 논의가 진행되지 않아, 이번 토론에서는 결론을 내리기 어렵다.",
      recommendation: "",
    };
  }

  const shortDebate = messages.length < MIN_MESSAGES_FOR_FULL_REPORT;
  const atlasLines = personaReportLines("atlas", messages);
  const cipherLines = personaReportLines("cipher", messages);
  const emberLines = personaReportLines("ember", messages);

  return {
    title: reportTitle(topic),
    executiveSummary: buildExecutiveSummary(topic, messages, endReason),
    consensusPoints: findConsensusPoints(messages),
    proArguments: atlasLines,
    conArguments: cipherLines,
    emberArguments: emberLines,
    unresolvedIssues: shortDebate
      ? ["논의가 충분히 이어지지 않아 쟁점 일부는 열린 채로 남았다."]
      : [],
    finalConclusion: buildDecisiveConclusion(topic, messages, shortDebate),
    recommendation: "",
  };
}

/** @deprecated buildStructuredReport 사용 */
export const buildOfflineReport = buildStructuredReport;

export async function generateFinalReport(
  topic: string,
  messages: DebateMessage[],
  options?: {
    endReason?: string | null;
    apiKey?: string;
    model?: string;
    provider?: ApiProvider;
  },
): Promise<Omit<DebateReport, "debateId" | "generatedAt">> {
  return buildStructuredReport(topic, messages, options?.endReason);
}
