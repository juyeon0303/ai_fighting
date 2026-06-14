import type { Persona, PersonaId } from "./types";

export const DEBATE_TURN_ORDER: PersonaId[] = ["atlas", "cipher", "ember"];
export const TURNS_PER_ROUND = DEBATE_TURN_ORDER.length;
/** 발언 사이 최소 대기 (기존 토론도 이 값 이하로 동작) */
export const DEFAULT_TURN_INTERVAL_MS = 1_500;
export const WORKER_TICK_MS = 500;

export function effectiveTurnIntervalMs(storedMs: number): number {
  return Math.min(storedMs, DEFAULT_TURN_INTERVAL_MS);
}

export const PERSONAS: Record<PersonaId, Persona> = {
  atlas: {
    id: "atlas",
    name: "아틀라스",
    role: "원리·큰 그림",
    color: "#f59e0b",
    emoji: "🌌",
  },
  cipher: {
    id: "cipher",
    name: "사이퍼",
    role: "논리·구조",
    color: "#8b5cf6",
    emoji: "🔑",
  },
  ember: {
    id: "ember",
    name: "엠버",
    role: "비유·직관",
    color: "#06b6d4",
    emoji: "✨",
  },
};

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

export function getPersona(id: string): Persona {
  return PERSONAS[normalizePersonaId(id)];
}

export function geniusLens(personaId: PersonaId): string {
  const lenses: Record<PersonaId, string> = {
    atlas: "1차 원리·큰 그림",
    cipher: "논리·정의·반례",
    ember: "비유·직관·실험",
  };
  return lenses[personaId];
}
