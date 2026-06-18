import OpenAI from "openai";
import type { ApiProvider, DebateMessage, DebateReport } from "./types";
import { DEBATE_TURN_ORDER, GOD_DISPLAY_NAME, isGodSpeaker, normalizePersonaId, personaDisplayName, providerFromMessageSource } from "./personas";
import { parseTopic } from "./topic-context";
import { DEFAULT_OPENAI_MODEL } from "./openai-models";
import { DEFAULT_GEMINI_MODEL } from "./gemini-models";
import { requestGeminiTurn } from "./gemini";

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

function isWishyWashyConclusion(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 10) return true;
  return (
    /(?:양쪽|둘\s*다|모두|각(?:기|자)|서로\s*다른|각각의?\s*매력|즐거움을\s*준|확인(?:했|하)|도달(?:했|하))/.test(
      t,
    ) &&
    !/(?:낫|우위|선|추천|pick|이긴|압도|손|탑|정답|결론(?:은|이)\s*[:：]?\s*\S{2,})/i.test(
      t,
    )
  ) ||
    /(?:단일\s*정답|정답\s*없|시각에\s*따라|취향\s*차|상황(?:에)?\s*따라|애매|중립|균형\s*잡|양보\s*없)/.test(
      t,
    ) ||
    /(?:운영\s*방식|매력|다양|공존|공존|조화)/.test(t) &&
      !/(?:낫|우위|선택|추천|손)/.test(t);
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
    const parts = m.content
      .split(/(?<=[.!?…]|다|임|함|요|지|야|어|냐|네|거야|같아|거든|잖아|래|줘|ㅋ|ㅎ)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (let i = parts.length - 1; i >= 0; i--) {
      const line = parts[i]!;
      if (line.length < 14 || hedgeRe.test(line)) continue;
      if (decisiveRe.test(line)) {
        return line.length > 200 ? `${line.slice(0, 197).trim()}…` : line;
      }
    }
  }

  return null;
}

function buildDecisiveConclusion(
  topic: string,
  messages: DebateMessage[],
): string {
  const ctx = parseTopic(topic);
  const line = extractDecisiveLine(messages);
  if (line && !isWishyWashyConclusion(line)) return line;

  const { sideA, sideB, debateQuestion, mode } = ctx;

  if (sideA && sideB) {
    const scoreA = sideAdvocacyScore(messages, sideA);
    const scoreB = sideAdvocacyScore(messages, sideB);
    if (scoreA > scoreB) {
      return `이 대화 기준으로는 ${sideA}가 ${sideB}보다 한 수 위다.`;
    }
    if (scoreB > scoreA) {
      return `이 대화 기준으로는 ${sideB}가 ${sideA}보다 한 수 위다.`;
    }
    return `${sideA}와 ${sideB} 중 하나를 고르라면, 후반 논거 기준 ${sideA} 쪽이 더 납득된다.`;
  }

  if (mode === "proposition") {
    const yes = messages.filter((m) =>
      /(?:찬성|맞(?:는|아|다)|해야|동의|긍정|가능)/.test(m.content),
    ).length;
    const no = messages.filter((m) =>
      /(?:반대|아닌|틀렸|안\s*(?:돼|됨|해)|부정|불가)/.test(m.content),
    ).length;
    if (yes > no) return `「${debateQuestion}」— 대화 흐름상 찬성 쪽이 더 설득력 있다.`;
    if (no > yes) return `「${debateQuestion}」— 대화 흐름상 반대 쪽이 더 설득력 있다.`;
  }

  const last = messages[messages.length - 1]?.content.trim();
  if (last && last.length >= 16 && !isWishyWashyConclusion(last)) {
    return last.length > 200 ? `${last.slice(0, 197).trim()}…` : last;
  }

  return `「${ctx.displayTopic || topic}」— ${namesSummary(messages)} 대화를 종합하면, 후반에 나온 주장 쪽이 더 납득된다.`;
}

function finalizeConclusion(
  raw: string | undefined,
  topic: string,
  messages: DebateMessage[],
): string {
  const text = String(raw ?? "").trim();
  if (text && !isWishyWashyConclusion(text) && !isBoilerplateReportText(text)) {
    return text;
  }
  return buildDecisiveConclusion(topic, messages);
}

function cleanReportItems(items: string[] | undefined): string[] {
  return (items ?? []).map((s) => s.trim()).filter((s) => !isBoilerplateReportText(s));
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
      return "사용자 종료";
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

const REPORT_LLM_TIMEOUT_MS = 18_000;
const REPORT_LLM_MAX_TOKENS = 420;
const REPORT_HISTORY_MAX_MESSAGES = 28;
const REPORT_HISTORY_MAX_CHARS = 7_000;

function historyForReport(messages: DebateMessage[]): string {
  const slice = messages.slice(-REPORT_HISTORY_MAX_MESSAGES);
  let text = slice
    .map((m) => {
      const body = m.content.replace(/\s+/g, " ").trim();
      const clipped = body.length > 220 ? `${body.slice(0, 217)}…` : body;
      return `[${speakerLabel(m)}] ${clipped}`;
    })
    .join("\n");

  if (text.length > REPORT_HISTORY_MAX_CHARS) {
    text = `…(앞 발언 생략)\n${text.slice(-REPORT_HISTORY_MAX_CHARS)}`;
  }
  return text || "(없음)";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function callLLM(
  prompt: string,
  maxTokens = REPORT_LLM_MAX_TOKENS,
  options?: { apiKey?: string; model?: string; provider?: ApiProvider },
): Promise<string | null> {
  const key = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) return null;

  const run = async (): Promise<string | null> => {
    if (options?.provider === "gemini") {
      const result = await requestGeminiTurn(
        key,
        options.model ?? DEFAULT_GEMINI_MODEL,
        "JSON만 출력",
        prompt,
        maxTokens,
        { singleAttempt: true, fastFailRateLimit: true },
      );
      return result.content;
    }

    const client = new OpenAI({ apiKey: key });
    try {
      const response = await client.chat.completions.create({
        model: options?.model ?? DEFAULT_OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.55,
      });
      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  };

  return withTimeout(run(), REPORT_LLM_TIMEOUT_MS);
}

function buildOfflineReport(
  topic: string,
  messages: DebateMessage[],
  endReason?: string | null,
): Omit<DebateReport, "debateId" | "generatedAt"> {
  const ctx = parseTopic(topic);
  const atlasMsgs = msgsForGenius("atlas", messages);
  const cipherMsgs = msgsForGenius("cipher", messages);
  const emberMsgs = msgsForGenius("ember", messages);

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
  const finalConclusion = finalizeConclusion(
    lastEmber && !isWishyWashyConclusion(lastEmber) ? lastEmber : undefined,
    topic,
    messages,
  );

  return {
    title: `${topic} — 대화 종합 보고서`,
    executiveSummary: `총 ${messages.length}개 발언으로 ${topicBrief}를 다뤘다. ${namesSummary(messages)}가 각자 시각으로 대화했다.`,
    consensusPoints: cleanReportItems(personaSummaryBullets(emberMsgs, 2)),
    proArguments: personaSummaryBullets(atlasMsgs, 3),
    conArguments: personaSummaryBullets(cipherMsgs, 3),
    emberArguments: personaSummaryBullets(emberMsgs, 3),
    unresolvedIssues: [],
    finalConclusion,
    recommendation: "",
  };
}

export { buildOfflineReport };

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
  if (messages.length === 0) {
    return buildOfflineReport(topic, messages, options?.endReason);
  }

  const historyText = historyForReport(messages);

  const atlasName = personaDisplayName(
    "atlas",
    providerFromMessageSource(
      messages.find(
        (m) => !isGodSpeaker(m.personaId) && normalizePersonaId(m.personaId) === "atlas",
      )?.llmSource,
    ),
  );
  const cipherName = personaDisplayName(
    "cipher",
    providerFromMessageSource(
      messages.find(
        (m) => !isGodSpeaker(m.personaId) && normalizePersonaId(m.personaId) === "cipher",
      )?.llmSource,
    ),
  );
  const emberName = personaDisplayName(
    "ember",
    providerFromMessageSource(
      messages.find(
        (m) => !isGodSpeaker(m.personaId) && normalizePersonaId(m.personaId) === "ember",
      )?.llmSource,
    ),
  );

  const ctx = parseTopic(topic);

  const llmResult = options?.apiKey
    ? await callLLM(
        `주제: "${topic}"
${ctx.sideA && ctx.sideB ? `비교: ${ctx.sideA} vs ${ctx.sideB}` : ""}
발언(${messages.length}개, 최근 위주):
${historyText}

JSON만. ${atlasName}·${cipherName}·${emberName} 관점 각각 1~2줄 요약.
finalConclusion은 한쪽을 가리키는 결론 1~2문장(중립 금지).
unresolvedIssues·recommendation은 빈 값.
{
  "title": "보고서 제목",
  "executiveSummary": "2~3문장",
  "consensusPoints": [],
  "proArguments": ["${atlasName} 핵심"],
  "conArguments": ["${cipherName} 핵심"],
  "emberArguments": ["${emberName} 핵심"],
  "unresolvedIssues": [],
  "finalConclusion": "단호한 결론",
  "recommendation": ""
}`,
        REPORT_LLM_MAX_TOKENS,
        options,
      )
    : null;

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
          finalConclusion: finalizeConclusion(parsed.finalConclusion, topic, messages),
          recommendation: isBoilerplateReportText(recommendation)
            ? ""
            : recommendation,
        };
      }
    } catch {
      // fall through to offline report
    }
  }

  return buildOfflineReport(topic, messages, options?.endReason);
}
