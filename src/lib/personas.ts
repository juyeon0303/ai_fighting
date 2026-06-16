import type { ApiLayout, ApiProvider, DebateMessage, MessageSpeakerId, Persona, PersonaId } from "./types";
import { personaProvider } from "./debate-llm-config";

export const DEBATE_TURN_ORDER: PersonaId[] = ["atlas", "cipher", "ember"];
/** 타임라인·예산 안내용 묶음 크기 (발언 순서와 무관) */
export const TURNS_PER_ROUND = DEBATE_TURN_ORDER.length;
/** 발언 사이 최소 대기 (기존 토론도 이 값 이하로 동작) */
export const DEFAULT_TURN_INTERVAL_MS = 1_500;
export const WORKER_TICK_MS = 500;

export function effectiveTurnIntervalMs(storedMs: number): number {
  return Math.min(storedMs, DEFAULT_TURN_INTERVAL_MS);
}

const GEMINI_NAMES: Record<PersonaId, string> = {
  atlas: "자",
  cipher: "강",
  ember: "세",
};

const GPT_NAMES: Record<PersonaId, string> = {
  atlas: "J",
  cipher: "K",
  ember: "S",
};

export const PERSONA_META: Record<
  PersonaId,
  Pick<Persona, "role" | "color" | "emoji">
> = {
  atlas: {
    role: "원리·큰 그림",
    color: "#d4af6a",
    emoji: "🜁",
  },
  cipher: {
    role: "논리·구조",
    color: "#4db6a0",
    emoji: "🜂",
  },
  ember: {
    role: "비유·직관",
    color: "#c9887a",
    emoji: "🜃",
  },
};

export function personaDisplayName(
  personaId: PersonaId,
  provider: ApiProvider,
): string {
  return provider === "gemini" ? GEMINI_NAMES[personaId] : GPT_NAMES[personaId];
}

export function personaNamesLabel(provider: ApiProvider): string {
  return DEBATE_TURN_ORDER.map((id) => personaDisplayName(id, provider)).join(
    "·",
  );
}

export function personaNamesLabelForLayout(layout: ApiLayout): string {
  return DEBATE_TURN_ORDER.map((id) =>
    personaDisplayName(id, personaProvider(layout, id)),
  ).join("·");
}

export const GOD_SPEAKER_ID = "god" as const satisfies MessageSpeakerId;
export const GOD_DISPLAY_NAME = "신";

export function isGodSpeaker(id: string): id is typeof GOD_SPEAKER_ID {
  return id === GOD_SPEAKER_ID;
}

export function messageSpeakerLabel(
  msg: DebateMessage,
  provider: ApiProvider = "gemini",
): string {
  if (isGodSpeaker(msg.personaId)) return GOD_DISPLAY_NAME;
  return personaDisplayName(normalizePersonaId(msg.personaId), provider);
}

export function lastPersonaMessage(messages: DebateMessage[]): DebateMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (!isGodSpeaker(msg.personaId)) return msg;
  }
  return null;
}

export function lastPersonaId(messages: DebateMessage[]): PersonaId | null {
  const msg = lastPersonaMessage(messages);
  return msg ? normalizePersonaId(msg.personaId) : null;
}

export function providerFromMessageSource(
  llmSource?: string | null,
): ApiProvider {
  return llmSource === "openai" ? "openai" : "gemini";
}

const LEGACY_PERSONA_MAP: Record<string, PersonaId> = {
  pro: "atlas",
  con: "cipher",
  neutral: "ember",
  moderator: "atlas",
  atlas: "atlas",
  cipher: "cipher",
  ember: "ember",
};

export function normalizePersonaId(id: string): PersonaId {
  return LEGACY_PERSONA_MAP[id] ?? "atlas";
}

function hashSeed(input: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 1_677_761_9);
  }
  return h >>> 0;
}

function seededUnit(seed: string): number {
  return hashSeed(seed) / 4_294_967_296;
}

function messagesSinceSpeaker(
  messages: DebateMessage[],
  personaId: PersonaId,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (isGodSpeaker(msg.personaId)) continue;
    if (normalizePersonaId(msg.personaId) === personaId) {
      return messages.length - 1 - i;
    }
  }
  return messages.length;
}

/** 고정 순서 없이 대화 맥락으로 다음 화자 선택 (연속 같은 화자 금지) */
export function pickNextSpeaker(
  messages: DebateMessage[],
  debateId: string,
): PersonaId {
  if (messages.length === 0) {
    const idx = Math.floor(
      seededUnit(`${debateId}:open`) * DEBATE_TURN_ORDER.length,
    );
    return DEBATE_TURN_ORDER[idx] ?? "atlas";
  }

  const lastMsg = messages[messages.length - 1]!;
  const lastFromGod = isGodSpeaker(lastMsg.personaId);
  const lastId = lastFromGod ? null : normalizePersonaId(lastMsg.personaId);
  const lastText = lastMsg.content;

  const scores: Record<PersonaId, number> = {
    atlas: 1,
    cipher: 1,
    ember: 1,
  };

  for (const id of DEBATE_TURN_ORDER) {
    if (lastId && id === lastId) scores[id] = 0;
    else scores[id] += 1.15;
  }

  if (lastFromGod) {
    for (const id of DEBATE_TURN_ORDER) {
      scores[id] += 2.2;
      if (lastText.includes(GEMINI_NAMES[id])) scores[id] += 2;
    }
  }

  for (const id of DEBATE_TURN_ORDER) {
    if (lastText.includes(GEMINI_NAMES[id])) scores[id] += 1.6;
  }

  if (/그건|아닌데|근데|솔직히|틀렸|반박|억지|맞긴|인정/.test(lastText)) {
    for (const id of DEBATE_TURN_ORDER) {
      if (lastId && id !== lastId) scores[id] += 0.55;
      else if (lastFromGod) scores[id] += 0.55;
    }
  }

  if (/[?？]|(?:니|냐|까)\s*$/.test(lastText.trim())) {
    for (const id of DEBATE_TURN_ORDER) {
      if (lastId && id !== lastId) scores[id] += 0.45;
      else if (lastFromGod) scores[id] += 0.45;
    }
  }

  const recent = messages
    .slice(-5)
    .filter((m) => !isGodSpeaker(m.personaId))
    .map((m) => normalizePersonaId(m.personaId));
  for (const id of DEBATE_TURN_ORDER) {
    const streak = recent.filter((r) => r === id).length;
    if (streak >= 3) scores[id] *= 0.08;
    else if (streak >= 2) scores[id] *= 0.22;
  }

  for (const id of DEBATE_TURN_ORDER) {
    const gap = messagesSinceSpeaker(messages, id);
    if (gap >= 4) scores[id] += 2;
    else if (gap >= 2) scores[id] += 0.75;
  }

  const total = DEBATE_TURN_ORDER.reduce((sum, id) => sum + scores[id], 0);
  if (total <= 0) {
    return DEBATE_TURN_ORDER.find((id) => id !== lastId) ?? "cipher";
  }
  let roll = seededUnit(`${debateId}:${messages.length}`) * total;
  for (const id of DEBATE_TURN_ORDER) {
    roll -= scores[id];
    if (roll <= 0) return id;
  }
  return lastId
    ? DEBATE_TURN_ORDER.find((id) => id !== lastId) ?? lastId
    : DEBATE_TURN_ORDER[0] ?? "atlas";
}

/** pickNextSpeaker 결과에 연속 발언이 섞이면 다른 화자로 교체 */
export function enforceNextSpeaker(
  messages: DebateMessage[],
  picked: PersonaId,
): PersonaId {
  if (messages.length === 0) return picked;
  const last = messages[messages.length - 1]!;
  if (isGodSpeaker(last.personaId)) return picked;
  const lastId = normalizePersonaId(last.personaId);
  if (picked !== lastId) return picked;
  return DEBATE_TURN_ORDER.find((id) => id !== lastId) ?? picked;
}

export function getPersona(
  id: string,
  provider: ApiProvider = "gemini",
): Persona {
  const pid = normalizePersonaId(id);
  return {
    id: pid,
    name: personaDisplayName(pid, provider),
    ...PERSONA_META[pid],
  };
}

export function geniusLens(personaId: PersonaId): string {
  const lenses: Record<PersonaId, string> = {
    atlas: "1차 원리·큰 그림",
    cipher: "논리·정의·반례",
    ember: "비유·직관·실험",
  };
  return lenses[personaId];
}

/** @deprecated provider 지정 시 getPersona(id, provider) 사용 */
export const PERSONAS: Record<PersonaId, Persona> = {
  atlas: { id: "atlas", name: "자", ...PERSONA_META.atlas },
  cipher: { id: "cipher", name: "강", ...PERSONA_META.cipher },
  ember: { id: "ember", name: "세", ...PERSONA_META.ember },
};
