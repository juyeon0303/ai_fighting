import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import { parseTopic, topicChatLine, topicUsesSearch } from "./topic-context";
import type { TopicDomain } from "./topic-context";
import {
  DEBATE_LENGTH_NORMAL,
  DEBATE_LENGTH_SAVE,
  DEBATE_VOICE_RULES,
} from "./debate-profile";
import {
  GOD_DISPLAY_NAME,
  isGodSpeaker,
  personaDisplayName,
  personaNamesLabel,
  normalizePersonaId,
  providerFromMessageSource,
} from "./personas";

export type ChatTurn = { role: "user" | "assistant"; text: string };

export { topicUsesSearch };

const META_LINE =
  /^\s*\*.*\*?\s*$|casual tone|Yes\.|^\s*-\s*(GE|MI|NI|자|강|세|J|K|S)\s*:/i;

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
  "근거나 반례 하나 넣고 말해.",
  "짧게. 단톡 속도로, 생각은 깊게.",
];

const POSITIVE_NEAR =
  /(?:꾸준|1인분|무섭|고점|압도|캐리|맞(?:아|긴)?|인정|좋(?:아|다|긴)?|낫(?:다|긴)?|강하|대단|최고|우위|증명|핵심|goat)/i;
const NEGATIVE_NEAR =
  /(?:뇌절|작아|비교(?:가)?\s*안|별로|약(?:하)?|틀렸|억지|못(?:하)?|실망|하차|깨|안\s*됨)/i;
const PIVOT_PHRASE =
  /(?:아까|방금\s*말|인정(?:하지만|하(?:면|지만))|근데\s*그건|그래도|취소|바꿔|지금\s*생각|말\s*바꿔)/;
const SELF_ANSWER_OPEN =
  /^(?:그치|그래(?:서)?|맞(?:아|긴)|ㅇㅇ|그러니까|결국|당연|인정(?:해)?|알지|그건\s*맞)/;
const META_CHAT_DRIFT =
  /(?:톡방|단톡(?:방)?|우리\s*방|팝콘|마라톤\s*회의|채팅창|분석글(?:\s*도배)?|뇌절(?:이)?\s*(?:기본|하잖|패시브)|심심해서\s*죽|잠\s*다\s*잤)/;

const DOMAIN_TOPIC_TERMS: Record<TopicDomain, RegExp> = {
  esports:
    /페이커|쵸비|faker|chovy|롤|lol|경기|라인|한타|월드|lck|lpl|티원|미드|슈퍼플레이|트로피|커리어|운영|프로게이머/i,
  food: /치킨|피자|맛|먹|음식|요리|레시피|메뉴/i,
  tech: /코드|앱|프로그래|ai|인공지능|서버|클라우드|iphone|android|react|vue/i,
  entertainment: /영화|드라마|게임|애니|음악|아이돌|넷플릭스|netflix/i,
  social: /연애|결혼|정치|경제|직장|학교|사회|원격/i,
  science: /과학|물리|화학|지구|우주|dna|양자|실험/i,
  philosophy:
    /자유|의지|존재|인식|윤리|도덕|정의|의미|진리|실재|인간|의식|행복|선악|철학|사회|구성원|교도소|죄|책임|권리|법|격리|수감|결정론|양자|본질|가치|정체성|의무|권력|정의|공정/i,
  general: /주제|논점|쟁점|비교|장단|사회|인간|법|권리/i,
};

function topicRelevanceHits(text: string, ctx: TopicContext): number {
  let hits = 0;
  const lower = text.toLowerCase();
  for (const anchor of ctx.anchors) {
    if (anchor.length >= 2 && lower.includes(anchor.toLowerCase())) hits++;
  }
  if (DOMAIN_TOPIC_TERMS[ctx.domain].test(text)) hits++;
  if (ctx.domain !== "general" && DOMAIN_TOPIC_TERMS.general.test(text)) hits++;
  return hits;
}

function entitySeeds(topic: string): string[] {
  const ctx = parseTopic(topic);
  const seeds = new Set<string>();
  for (const s of [ctx.sideA, ctx.sideB, ctx.displayTopic, topic]) {
    if (s && s.trim().length >= 2) seeds.add(s.trim());
  }
  for (const part of topic.split(/[\s·/|vs]+/i)) {
    const p = part.trim();
    if (p.length >= 2 && p.length <= 12) seeds.add(p);
  }
  return [...seeds];
}

function entitiesInText(text: string, seeds: string[]): string[] {
  const found = seeds.filter((s) => text.includes(s));
  const extra = text.match(/[가-힣A-Za-z]{2,8}/g) ?? [];
  for (const w of extra) {
    if (seeds.some((s) => s.includes(w) || w.includes(s))) found.push(w);
  }
  return [...new Set(found)];
}

function sentimentNearEntity(text: string, entity: string): number {
  let score = 0;
  let idx = 0;
  while (idx < text.length) {
    const at = text.indexOf(entity, idx);
    if (at === -1) break;
    const window = text.slice(Math.max(0, at - 36), at + entity.length + 36);
    if (POSITIVE_NEAR.test(window)) score += 1;
    if (NEGATIVE_NEAR.test(window)) score -= 1;
    idx = at + entity.length;
  }
  return score;
}

/** 같은 화자가 직전 입장과 반대 프레임으로 말하면 true (재시도) */
export function contradictsOwnRecentSpeech(
  personaId: PersonaId,
  history: DebateMessage[],
  newText: string,
  topic: string,
): boolean {
  const t = newText.trim();
  if (!t || PIVOT_PHRASE.test(t)) return false;

  const own = history.filter(
    (m) => !isGodSpeaker(m.personaId) && normalizePersonaId(m.personaId) === personaId,
  );
  if (own.length === 0) return false;

  const seeds = entitySeeds(topic);
  const recentOwn = own
    .slice(-3)
    .map((m) => m.content)
    .join(" ");
  const entities = entitiesInText(`${recentOwn} ${t}`, seeds);
  if (entities.length === 0) return false;

  for (const entity of entities) {
    const prior = own
      .slice(-2)
      .reduce((sum, m) => sum + sentimentNearEntity(m.content, entity), 0);
    const now = sentimentNearEntity(t, entity);
    if (prior >= 1 && now <= -1) return true;
    if (prior <= -1 && now >= 1) return true;
  }
  return false;
}

/** 직전 발언자가 자기 자신인데, 자기 말에 동의·받아치기 하면 true */
export function isSelfAnswerTurn(
  personaId: PersonaId,
  history: DebateMessage[],
  newText: string,
): boolean {
  const last = history[history.length - 1];
  if (!last || isGodSpeaker(last.personaId) || normalizePersonaId(last.personaId) !== personaId) return false;

  const t = newText.trim();
  if (!t || PIVOT_PHRASE.test(t)) return false;
  if (SELF_ANSWER_OPEN.test(t)) return true;

  const lastWords = new Set(last.content.match(/[가-힣]{2,}/g) ?? []);
  const newWords = t.match(/[가-힣]{2,}/g) ?? [];
  if (newWords.length >= 4 && lastWords.size >= 3) {
    const overlap =
      newWords.filter((w) => lastWords.has(w)).length / newWords.length;
    if (overlap >= 0.5 && /^(?:그치|근데|솔직히|결국|그래)/.test(t)) return true;
  }
  return false;
}

/** 주제에서 너무 벗어난 잡담·메타 수다면 true (모든 주제 동일 기준) */
export function driftsOffTopic(
  topic: string,
  history: DebateMessage[],
  newText: string,
): boolean {
  const ctx = parseTopic(topic);
  const t = newText.trim();
  if (!t || history.length < 6) return false;
  if (topicRelevanceHits(t, ctx) >= 1) return false;
  if (META_CHAT_DRIFT.test(t)) return true;

  const recent = [...history.slice(-2).map((m) => m.content), t];
  const allOffTopic = recent.every((line) => topicRelevanceHits(line, ctx) === 0);
  return allOffTopic && /(?:ㅋㅋ|꿀잼|재밌|뇌절|우리\s*방|팝콘|톡방)/.test(t);
}

/** 꾸며낸 인용·에세이 남발만 재시도 */
export function isLowQualityTurn(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if ((t.match(/결국/g) ?? []).length >= 3) return true;
  if (ENGLISH_STAGE.test(t)) return true;
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
  const length = tokenSaveMode ? DEBATE_LENGTH_SAVE : DEBATE_LENGTH_NORMAL;

  return [
    `너는 ${name}. ${PERSONA_VOICE[personaId]}`,
    `친구 ${names}랑 ${chat}`,
    length,
    DEBATE_VOICE_RULES,
  ].join(" ");
}

function openingUserMessage(ctx: TopicContext, provider: ApiProvider): string {
  return `${topicChatLine(ctx)}\n${personaNamesLabel(provider)} 셋이 막 수다해. 순서 없음. 토론장 말투 말고 친구 단톡처럼.\n신(사용자)이 중간에 끼어들 수 있음 — 그때 지시·태클 우선.`;
}

function historyTurn(
  msg: DebateMessage,
  currentPersonaId: PersonaId,
  provider: ApiProvider,
): { role: "user" | "model"; text: string } {
  if (isGodSpeaker(msg.personaId)) {
    return { role: "user", text: `[${GOD_DISPLAY_NAME}]: ${msg.content}` };
  }
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
  topic: string,
  personaId: PersonaId,
  provider: ApiProvider,
  history: DebateMessage[],
  tokenSaveMode: boolean,
): string {
  const ctx = parseTopic(topic);
  const name = personaDisplayName(personaId, provider);
  const hint = TURN_HINTS[history.length % TURN_HINTS.length]!;
  const short = tokenSaveMode ? " 더 짧게." : "";

  const ownRecent = history
    .filter(
      (m) =>
        !isGodSpeaker(m.personaId) &&
        normalizePersonaId(m.personaId) === personaId,
    )
    .slice(-2);

  const last = history[history.length - 1];
  const lastIsGod = last ? isGodSpeaker(last.personaId) : false;
  const lastId = last && !lastIsGod ? normalizePersonaId(last.personaId) : personaId;
  const lastName = last
    ? lastIsGod
      ? GOD_DISPLAY_NAME
      : personaDisplayName(lastId, providerFromMessageSource(last.llmSource))
    : name;

  let nudge: string;
  if (history.length === 0) {
    nudge = `${name}, 분위기 보고 한마디.${short}`;
  } else if (lastIsGod) {
    nudge = `[${GOD_DISPLAY_NAME}] 태클·지시 듣고 반응해. 반말로, 무시하지 마.${short}`;
  } else if (lastId === personaId) {
    nudge = `방금 네가 말했으니 자문자답 금지. 남 반응 기다리거나 새 각도만.${short}`;
  } else {
    nudge = `[${lastName}] 말 듣고 끼어들어. ${hint}${short}`;
  }

  if (ownRecent.length > 0) {
    const recap = ownRecent
      .map((m) => m.content.replace(/\s+/g, " ").trim())
      .join(" / ")
      .slice(0, 220);
    nudge += `\n[네가 방금까지 한 말]: ${recap}. 이거랑 모순되면 안 됨.`;
  }

  if (history.length >= 4) {
    nudge += `\n「${ctx.topic}」에서 너무 벗어나지 마.`;
  }

  return nudge;
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
    topic,
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
  contradiction = false,
  selfAnswer = false,
  drift = false,
): string {
  if (contradiction) {
    return tokenSaveMode
      ? "네 말이 아까랑 모순됐어. 같은 입장 이어가거나 '아까 말 취소'하고 이유부터. 다시."
      : "네가 아까 한 말이랑 모순됐어. 입장 이어가거나 바꿀 거면 이유부터 말하고 다시.";
  }
  if (selfAnswer) {
    return tokenSaveMode
      ? "방금 네 말에 '그치' 받은 자문자답이야. 남 말에 반응하거나 새 포인트만. 다시."
      : "자기 말에 동의·받아치기 한 자문자답이야. 친구 말에 반응하거나 다른 각도로 다시.";
  }
  if (drift) {
    return "주제에서 너무 벗어났어. 지금 주제 중심으로 다시.";
  }
  if (incomplete) {
    return tokenSaveMode
      ? "중간에 끊겼어. 1~3문장, 끝까지 마무리해서 다시."
      : "중간에 끊겼어. 문장 끝까지 자연스럽게 마무리하고 다시.";
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
