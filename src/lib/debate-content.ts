import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  personaDisplayName,
  personaNamesLabel,
  providerFromMessageSource,
} from "./personas";

export type ChatTurn = { role: "user" | "assistant"; text: string };

const META_LINE =
  /^\s*\*.*\*?\s*$|casual tone|banmal|Yes\.|^\s*-\s*(GE|MI|NI)\s*:/i;

/** 에세이·꾸며낸 근거 패턴 — 2개 이상이면 재생성 */
const ESSAY_RED_FLAGS: RegExp[] = [
  /(?:스탠퍼드|하버드|MIT|옥스퍼드).{0,16}(?:실험|연구|대학)/,
  /(?:19|20)\d{2}년(?:대)?\s*(?:실험|연구|조사|분석)/,
  /통계(?:적)?(?:으로)?\s*(?:보면|에\s*따르면)/,
  /연구(?:에)?\s*(?:따르면|결과|보고)/,
  /\d{2,3}\s*%\s*(?:이상|정도|확률|높)/,
  /(?:피드백\s*루프|전략\s*게임|임계점|변수로\s*작용)/,
  /(?:본질|근본|실존)(?:적)?(?:으로)?/,
];

const SUSPICIOUS_SENTENCE =
  /(?:스탠퍼드|하버드|MIT|옥스퍼드).{0,16}(?:실험|연구)|(?:19|20)\d{2}년(?:대)?|통계(?:적)?(?:으로)?|연구(?:에)?\s*따르면|\d{2,3}\s*%\s*(?:이상|정도|확률)|피드백\s*루프|전략\s*게임|실존(?:적)?|임계점|변수로\s*작용|본질(?:적)?|근본(?:적)?/;

const SENTENCE_SPLIT =
  /(?<=[.!?…]|다|임|함|요|지|야|어|냐|네|거야|같아|거든|잖아|래|줘)\s+/;

/** 에세이체·허위 근거 — 재시도 트리거 */
export function isLowQualityTurn(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if ((t.match(/결국/g) ?? []).length >= 2) return true;
  if (/^GE\s*의견에\s*동의|^MI\s*말이\s*맞|^맞아,?\s*MI/.test(t)) return true;

  let flags = 0;
  for (const re of ESSAY_RED_FLAGS) {
    if (re.test(t)) flags++;
  }
  return flags >= 2 || (flags >= 1 && t.length > 160);
}

/** 의심 문장만 제거 (검색 근거 문장은 살릴 여지) */
export function scrubLowQualityPhrases(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/(?:결국\s+){2,}/g, "결국 ");
  t = t.replace(/^결국\s+/g, "");

  const parts = t.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return t;

  const filtered = parts.filter((s) => !SUSPICIOUS_SENTENCE.test(s));
  if (filtered.length === 0) return t;
  const out = filtered.join(" ").replace(/\s+/g, " ").trim();
  return out.length >= 16 ? out : t;
}

/** 페르소나별 system — Gemini 앱처럼 역할을 분리 */
export function personaSystemInstruction(
  topic: string,
  personaId: PersonaId,
  provider: ApiProvider,
): string {
  const name = personaDisplayName(personaId, provider);
  const roles: Record<PersonaId, string> = {
    atlas:
      "큰 그림·핵심 변수를 짚어. 직전 말이 과하면 반박해도 됨.",
    cipher:
      "논리·반례 담당. 동의는 정말 맞을 때만 — 허술한 근거·꾸며낸 숫자·실험 인용은 바로 찌르고 물고 늘어져.",
    ember:
      "쉬운 비유로 말해. 직전 말이 억지면 '그건 좀 아닌데' 하고 반박해.",
  };

  return [
    `친구들이랑 「${topic}」 가볍게 토론 중. 너는 ${name}.`,
    roles[personaId],
    "2~4문장, 편한 반말. 재미는 살려도 됨.",
    "사실·숫자는 검색으로 확인한 것만. 모르면 '잘 모르겠는데'만.",
    "대학·실험·%·연구 인용 대잔치 금지. 철학·심리 용어로 분위기만 잡지 마.",
    "빈동의('동의해'만) 금지 — 동의해도 이유 한 줄은 붙여.",
    "에세이체·「결국」남발·실존·미완·셈이지·체크리스트·메타 출력·주제 벗어난 큰소리 금지.",
    "이름·콜론(:) 붙이지 마.",
  ].join(" ");
}

function openingUserMessage(topic: string, provider: ApiProvider): string {
  return `주제: 「${topic}」\n\n${personaNamesLabel(provider)} 셋이 친구처럼 말하되, 틀리거나 과한 말엔 서로 반박해.`;
}

function pushbackHint(personaId: PersonaId): string {
  if (personaId === "cipher") {
    return "직전 말에서 허술한 부분 찾아 반박해. 동의만 하지 마.";
  }
  if (personaId === "atlas") {
    return "직전 말이 과하거나 빈틈 있으면 반박해. 맞으면 짧게 동의하고 한 발 더.";
  }
  return "직전 말이 억지면 반박하고, 맞으면 비유로 이어가.";
}

function currentTurnUserPrompt(
  personaId: PersonaId,
  provider: ApiProvider,
  history: DebateMessage[],
): string {
  const name = personaDisplayName(personaId, provider);
  if (history.length === 0) {
    return `${name}, 네가 먼저 말해. 주제에 닿는 말만, 지어낸 근거는 넣지 마.`;
  }
  const last = history[history.length - 1]!;
  const lastName = personaDisplayName(
    last.personaId,
    providerFromMessageSource(last.llmSource),
  );
  return `${name} 차례야. ${lastName} 말에 ${pushbackHint(personaId)} 같은 말 반복 말고 구체적으로.`;
}

/** Gemini API 멀티턴 contents (user/model 교차) */
export function buildGeminiContents(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
): Array<{ role: "user" | "model"; text: string }> {
  if (history.length === 0) {
    return [
      {
        role: "user",
        text: `${openingUserMessage(topic, provider)}\n\n${currentTurnUserPrompt(personaId, provider, history)}`,
      },
    ];
  }

  const contents: Array<{ role: "user" | "model"; text: string }> = [
    { role: "user", text: openingUserMessage(topic, provider) },
  ];

  for (const msg of history) {
    contents.push({ role: "model", text: msg.content });
    contents.push({ role: "user", text: "이어서." });
  }

  contents.pop();
  contents.push({
    role: "user",
    text: currentTurnUserPrompt(personaId, provider, history),
  });

  return contents;
}

/** OpenAI chat messages (system 제외) */
export function buildOpenAiChatTurns(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
): ChatTurn[] {
  if (history.length === 0) {
    return [
      {
        role: "user",
        text: `${openingUserMessage(topic, provider)}\n\n${currentTurnUserPrompt(personaId, provider, history)}`,
      },
    ];
  }

  const turns: ChatTurn[] = [
    { role: "user", text: openingUserMessage(topic, provider) },
  ];

  for (const msg of history) {
    turns.push({ role: "assistant", text: msg.content });
    turns.push({ role: "user", text: "이어서." });
  }

  turns.pop();
  turns.push({
    role: "user",
    text: currentTurnUserPrompt(personaId, provider, history),
  });

  return turns;
}

/** 모델 메타·라벨 오염 제거 */
export function sanitizeTurnOutput(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !META_LINE.test(l));

  let text = lines.join(" ").replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:GE|MI|NI|G|P|T)\s*:\s*/i, "");
  text = scrubLowQualityPhrases(text);
  return text.trim();
}

export function buildDebateRetryHint(quality = false): string {
  if (quality) {
    return "에세이·가짜 통계·대학 실험 인용 빼. 주제에 닿는 친구 반말 2~4문장으로 다시.";
  }
  return "지어낸 근거 넣지 마. 검색 없으면 숫자 빼. 친구 반말 2~4문장으로 다시.";
}

/** @deprecated 시뮬 호환 — 멀티턴 첫 user 메시지 검증용 */
export function buildDebatePrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  _round: number,
  provider: ApiProvider,
): string {
  const contents = buildGeminiContents(
    ctx.topic,
    history,
    personaId,
    provider,
  );
  return contents.map((c) => `[${c.role}] ${c.text}`).join("\n");
}
