import type { ApiLayout, ApiProvider, Persona, PersonaId } from "./types";
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
  atlas: "GE",
  cipher: "MI",
  ember: "NI",
};

const GPT_NAMES: Record<PersonaId, string> = {
  atlas: "G",
  cipher: "P",
  ember: "T",
};

export const PERSONA_META: Record<
  PersonaId,
  Pick<Persona, "role" | "color" | "emoji">
> = {
  atlas: {
    role: "원리·큰 그림",
    color: "#f59e0b",
    emoji: "🧑",
  },
  cipher: {
    role: "논리·구조",
    color: "#8b5cf6",
    emoji: "🧠",
  },
  ember: {
    role: "비유·직관",
    color: "#06b6d4",
    emoji: "💡",
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
  atlas: { id: "atlas", name: "GE", ...PERSONA_META.atlas },
  cipher: { id: "cipher", name: "MI", ...PERSONA_META.cipher },
  ember: { id: "ember", name: "NI", ...PERSONA_META.ember },
};
