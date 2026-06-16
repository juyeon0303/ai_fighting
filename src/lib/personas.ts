import type { ApiLayout, ApiProvider, DebateMessage, Persona, PersonaId } from "./types";
import { personaProvider } from "./debate-llm-config";

export const DEBATE_TURN_ORDER: PersonaId[] = ["atlas", "cipher", "ember"];
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

export function getNextPersona(_round: number, messageCount: number): PersonaId {
  return DEBATE_TURN_ORDER[messageCount % TURNS_PER_ROUND];
}

/** 저장 직전·턴 시작 시 화자 순서 검증 (다중 워커 레이스 방지) */
export function canAppendTurn(
  messages: DebateMessage[],
  personaId: PersonaId,
): boolean {
  const count = messages.length;
  const expected = getNextPersona(
    Math.floor(count / TURNS_PER_ROUND) + 1,
    count,
  );
  if (expected !== personaId) return false;
  if (count === 0) return true;

  const last = normalizePersonaId(messages[count - 1]!.personaId);
  return last !== personaId;
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
