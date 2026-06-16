import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  personaDisplayName,
  personaNamesLabel,
  normalizePersonaId,
  providerFromMessageSource,
} from "./personas";

export type ChatTurn = { role: "user" | "assistant"; text: string };

const META_LINE =
  /^\s*\*.*\*?\s*$|casual tone|banmal|Yes\.|^\s*-\s*(GE|MI|NI|자|강|세|J|K|S)\s*:/i;

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
  if (/^자\s*의견에\s*동의|^강\s*말이\s*맞|^맞아,?\s*강/.test(t)) return true;

  let flags = 0;
  for (const re of ESSAY_RED_FLAGS) {
    if (re.test(t)) flags++;
  }
  return flags >= 2;
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
  tokenSaveMode = false,
): string {
  const name = personaDisplayName(personaId, provider);
  const roles: Record<PersonaId, string> = {
    atlas:
      "큰 그림·핵심 변수. 방금 말에 먼저 반응한 뒤 한두 포인트만.",
    cipher:
      "논리·반례. 억지·꾸며낸 숫자·실험 인용은 바로 찌르고, 맞을 때만 이유 붙여 동의.",
    ember:
      "쉬운 비유. 방금 말이 억지면 '그건 좀' 하고 반박, 맞으면 비유로 이어가.",
  };

  const lengthRule = tokenSaveMode
    ? "1~3문장 짧은 반말. 핵심만. 마지막은 반드시 완전한 문장으로 끝내 — 중간에 끊지 마."
    : "친구 단톡처럼 편한 반말. 마지막은 반드시 완전한 문장(다/요/거든/잖아 등)으로 끝내 — 중간에 끊지 마.";

  return [
    `너는 ${name}. 친구 ${personaNamesLabel(provider)}랑 「${topic}」 원탁 수다 중.`,
    roles[personaId],
    lengthRule,
    "출력은 미완성 어미·끊긴 문장으로 끝내지 마. 한 문장을 쓰다 말고 멈추지 마.",
    "말투: '근데', '솔직히', '아니', '그치만', '~거든' 같은 구어. 매번 같은 시작·패턴 반복 금지.",
    "항상 직전 말(다른 사람)부터 반응하고, 그다음에 네 의견.",
    "네가 예전에 한 말을 반박하거나, 자기 말을 남 말인 척 만들지 마.",
    `${personaNamesLabel(provider)} 순서(자→강→세)로 한 명씩만 말함 — 같은 사람이 두 번 연속 말하지 않음.`,
    "사실·숫자는 검색으로 확인한 것만. 모르면 '잘 모르겠는데'만.",
    "대학·실험·%·연구 인용 대잔치 금지. 철학·심리 용어로 분위기만 잡지 마.",
    "빈동의('동의해'만) 금지 — 동의해도 이유 한 줄은 붙여.",
    "에세이체·「결국」남발·실존·미완·셈이지·체크리스트·메타 출력·주제 벗어난 큰소리 금지.",
    "이름·콜론(:) 붙이지 마.",
  ].join(" ");
}

function openingUserMessage(topic: string, provider: ApiProvider): string {
  return `주제: 「${topic}」\n\n${personaNamesLabel(provider)} 셋이 원탁에 자→강→세 순서로 한 명씩 말해. 틀리거나 과한 말엔 바로 반박해.`;
}

/** 화자별 role — 내 말만 model, 남 말은 user+[이름] */
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

function pushbackHint(personaId: PersonaId): string {
  if (personaId === "cipher") {
    return "방금 말에서 허술한 데 찾아 반박해. 동의만 말하지 마";
  }
  if (personaId === "atlas") {
    return "방금 말에 먼저 반응해. 과하거나 틀리면 반박, 맞으면 짧게 동의하고 한 발 더";
  }
  return "방금 말이 억지면 반박, 맞으면 비유로 이어가";
}

function currentTurnUserPrompt(
  personaId: PersonaId,
  provider: ApiProvider,
  history: DebateMessage[],
  tokenSaveMode = false,
): string {
  const name = personaDisplayName(personaId, provider);
  const shortHint = tokenSaveMode ? " 짧게, 문장 끝까지." : "";
  if (history.length === 0) {
    return `${name}, 네가 먼저 말해. 주제에 닿는 말만, 지어낸 근거는 넣지 마.${shortHint}`;
  }
  const last = history[history.length - 1]!;
  const lastName = personaDisplayName(
    normalizePersonaId(last.personaId),
    providerFromMessageSource(last.llmSource),
  );
  return `${name} 차례. 직전 [${lastName}] 말에만 반응해 — ${lastName}가 아닌 다른 사람 말이나 네 예전 말을 반박하지 마. ${pushbackHint(personaId)}. 같은 말·문장 시작 반복하지 말고.${shortHint}`;
}

/** Gemini API 멀티턴 contents (user/model 교차) */
export function buildGeminiContents(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
  tokenSaveMode = false,
): Array<{ role: "user" | "model"; text: string }> {
  if (history.length === 0) {
    return [
      {
        role: "user",
        text: `${openingUserMessage(topic, provider)}\n\n${currentTurnUserPrompt(personaId, provider, history, tokenSaveMode)}`,
      },
    ];
  }

  const contents: Array<{ role: "user" | "model"; text: string }> = [
    { role: "user", text: openingUserMessage(topic, provider) },
  ];

  for (const msg of history) {
    contents.push(historyTurn(msg, personaId, provider));
  }

  contents.push({
    role: "user",
    text: currentTurnUserPrompt(personaId, provider, history, tokenSaveMode),
  });

  return contents;
}

/** OpenAI chat messages (system 제외) */
export function buildOpenAiChatTurns(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
  tokenSaveMode = false,
): ChatTurn[] {
  if (history.length === 0) {
    return [
      {
        role: "user",
        text: `${openingUserMessage(topic, provider)}\n\n${currentTurnUserPrompt(personaId, provider, history, tokenSaveMode)}`,
      },
    ];
  }

  const turns: ChatTurn[] = [
    { role: "user", text: openingUserMessage(topic, provider) },
  ];

  for (const msg of history) {
    const turn = historyTurn(msg, personaId, provider);
    turns.push({
      role: turn.role === "model" ? "assistant" : "user",
      text: turn.text,
    });
  }

  turns.push({
    role: "user",
    text: currentTurnUserPrompt(personaId, provider, history, tokenSaveMode),
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
  text = text.replace(/^(?:GE|MI|NI|자|강|세|G|P|T|J|K|S)\s*:\s*/i, "");
  text = scrubLowQualityPhrases(text);
  return text.trim();
}

export function buildDebateRetryHint(
  quality = false,
  tokenSaveMode = false,
  incomplete = false,
): string {
  if (incomplete) {
    return tokenSaveMode
      ? "문장이 중간에 끊겼어. 1~3문장, 마지막은 완전한 반말로 끝까지 다시."
      : "문장이 중간에 끊겼어. 마지막은 완결 어미(다/요/거든/잖아 등)로 끝내고 다시.";
  }
  if (quality) {
    return tokenSaveMode
      ? "에세이·가짜 통계 빼. 1~3문장, 문장 끝까지 짧게 다시."
      : "에세이·가짜 통계·대학 실험 인용 빼. 방금 말에 반응하는 친구 반말로 다시.";
  }
  return tokenSaveMode
    ? "지어낸 근거 빼. 1~3문장, 중간에 끊지 말고 짧게 다시."
    : "지어낸 근거 넣지 마. 검색 없으면 숫자 빼. 직전 말에 자연스럽게 이어지는 반말로 다시.";
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
