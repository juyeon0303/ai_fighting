import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import { parseTopic, topicChatLine, topicUsesSearch } from "./topic-context";
import {
  personaDisplayName,
  personaNamesLabel,
  normalizePersonaId,
  providerFromMessageSource,
} from "./personas";

export type ChatTurn = { role: "user" | "assistant"; text: string };

export { topicUsesSearch };

const META_LINE =
  /^\s*\*.*\*?\s*$|casual tone|Yes\.|^\s*-\s*(GE|MI|NI|자|강|세|J|K|S)\s*:/i;

const PRODUCT_META =
  /(?:한놈|두놈|세\s?놈).{0,12}(?:말하고|말한\s?뒤).{0,12}멈|멈추(?:네|고|는)|발언.{0,6}(?:안\s?나|없)/;

const ENGLISH_STAGE =
  /\([^)]*[A-Za-z]{3,}[^)]*\)|^\(?Metaphor\b|^\(?Note\b/i;

const FAKE_CITATION =
  /(?:스탠퍼드|하버드|MIT|옥스퍼드).{0,20}(?:연구|실험|대학)/;

const SENTENCE_SPLIT =
  /(?<=[.!?…]|다|임|함|요|지|야|어|냐|네|거야|같아|거든|잖아|래|줘|ㅋ|ㅎ)\s+/;

const PERSONA_VOICE: Record<PersonaId, string> = {
  atlas: "담담하게 큰 그림부터 보는 친구. 말투는 편한 반말.",
  cipher: "따지는 친구. 억지면 바로 '그건 좀' 하고, 맞으면 'ㅇㅇ 맞긴 해'도 함.",
  ember: "비유 잘 쓰는 친구. 복잡한 걸 쉽게 풀고 가끔 ㅋㅋ 섞음.",
};

const TURN_HINTS = [
  "방금 말에 툭 반응하고 네 생각 이어가.",
  "동의든 반박이든 친구한테 말하듯 자연스럽게.",
  "같은 시작 말고 한마디만 다르게.",
  "짧게. 단톡 속도로.",
];

/** 꾸며낸 인용·에세이 남발만 재시도 */
export function isLowQualityTurn(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if ((t.match(/결국/g) ?? []).length >= 3) return true;
  if (ENGLISH_STAGE.test(t)) return true;
  if (PRODUCT_META.test(t)) return true;
  if (/[A-Za-z]{5,}/.test(t) && (t.match(/[가-힣]/g)?.length ?? 0) < 8) return true;
  return FAKE_CITATION.test(t) && /(?:19|20)\d{2}년/.test(t);
}

/** 가짜 인용 문장만 제거 */
export function scrubLowQualityPhrases(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const parts = t.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return t;

  const filtered = parts.filter((s) => !FAKE_CITATION.test(s));
  if (filtered.length === 0) return t;
  const out = filtered.join(" ").trim();
  return out.length >= 12 ? out : t;
}

export function personaSystemInstruction(
  topic: string,
  personaId: PersonaId,
  provider: ApiProvider,
  tokenSaveMode = false,
): string {
  const ctx = parseTopic(topic);
  const name = personaDisplayName(personaId, provider);
  const names = personaNamesLabel(provider);
  const chat = topicChatLine(ctx);
  const length = tokenSaveMode
    ? "1~3문장, 단톡처럼 짧게."
    : "2~4문장, 친구 단톡 반말. 문장 길이 들쭉날쭉해도 됨.";

  return [
    `너는 ${name}. ${PERSONA_VOICE[personaId]}`,
    `친구 ${names}랑 ${chat}`,
    length,
    "말투: 근데, 솔직히, 아니, 그치, ㅋㅋ, ~거든, ~잖아 섞어 써.",
    "직전 말에 자연스럽게 이어져. 매번 '반박합니다' 같은 토론 말투는 금지.",
    "네 예전 말을 남 말처럼 만들거나 자기 말을 까지 마.",
    "꾸며낸 연구·대학 실험·통계 인용 금지. 확실치 않으면 단정 짧게.",
    "영어·메타·괄호 설명·비유 라벨 붙이지 마. 한국어 반말만.",
    "이름·콜론(:) 붙이지 마.",
  ].join(" ");
}

function openingUserMessage(ctx: TopicContext, provider: ApiProvider): string {
  return `${topicChatLine(ctx)}\n${personaNamesLabel(provider)} 셋이 돌아가며 수다해. 토론장 말투 말고 친구 단톡처럼.`;
}

function historyTurn(
  msg: DebateMessage,
  currentPersonaId: PersonaId,
  provider: ApiProvider,
): { role: "user" | "model"; text: string } {
  const speakerId = normalizePersonaId(msg.personaId);
  const speaker = personaDisplayName(
    speakerId,
    providerFromMessageSource(msg.llmSource),
  );
  if (speakerId === currentPersonaId) {
    return { role: "model", text: msg.content };
  }
  return { role: "user", text: `[${speaker}]: ${msg.content}` };
}

function currentTurnUserPrompt(
  personaId: PersonaId,
  provider: ApiProvider,
  history: DebateMessage[],
  tokenSaveMode: boolean,
): string {
  const name = personaDisplayName(personaId, provider);
  const hint = TURN_HINTS[history.length % TURN_HINTS.length]!;
  const short = tokenSaveMode ? " 더 짧게." : "";

  if (history.length === 0) {
    return `${name}, 네가 먼저. 가볍게 한마디.${short}`;
  }

  const last = history[history.length - 1]!;
  const lastName = personaDisplayName(
    normalizePersonaId(last.personaId),
    providerFromMessageSource(last.llmSource),
  );
  return `${name} 차례. [${lastName}] 말에 이어서. ${hint}${short}`;
}

function buildContents(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
  tokenSaveMode: boolean,
): Array<{ role: "user" | "model"; text: string }> {
  const ctx = parseTopic(topic);
  const opening = openingUserMessage(ctx, provider);
  const nudge = currentTurnUserPrompt(
    personaId,
    provider,
    history,
    tokenSaveMode,
  );

  if (history.length === 0) {
    return [{ role: "user", text: `${opening}\n\n${nudge}` }];
  }

  const contents: Array<{ role: "user" | "model"; text: string }> = [
    { role: "user", text: opening },
  ];
  for (const msg of history) {
    contents.push(historyTurn(msg, personaId, provider));
  }
  contents.push({ role: "user", text: nudge });
  return contents;
}

export function buildGeminiContents(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
  tokenSaveMode = false,
): Array<{ role: "user" | "model"; text: string }> {
  return buildContents(topic, history, personaId, provider, tokenSaveMode);
}

export function buildOpenAiChatTurns(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
  tokenSaveMode = false,
): ChatTurn[] {
  return buildContents(topic, history, personaId, provider, tokenSaveMode).map(
    (c) => ({
      role: c.role === "model" ? "assistant" : "user",
      text: c.text,
    }),
  );
}

export function sanitizeTurnOutput(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !META_LINE.test(l));

  let text = lines.join(" ").replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:GE|MI|NI|자|강|세|G|P|T|J|K|S)\s*:\s*/i, "");
  text = text.replace(/\([^)]*[A-Za-z]{3,}[^)]*\)\s*[:*]*\s*/gi, "");
  text = text.replace(/^\*+\s*/g, "");
  return text.trim();
}

export function buildDebateRetryHint(
  quality = false,
  tokenSaveMode = false,
  incomplete = false,
): string {
  if (incomplete) {
    return tokenSaveMode
      ? "중간에 끊겼어. 1~3문장, 친구 반말로 끝까지 다시."
      : "중간에 끊겼어. 친구 단톡 반말로 끝까지 다시.";
  }
  if (quality) {
    return "꾸며낸 연구·통계 빼고, 단톡 반말로 다시.";
  }
  return tokenSaveMode
    ? "더 짧고 자연스럽게, 친구 반말로 다시."
    : "친구 단톡처럼 자연스럽게 다시.";
}

/** @deprecated 시뮬 호환 */
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
