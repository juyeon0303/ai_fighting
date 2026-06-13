import type { Persona, PersonaId } from "./types";

export const DEBATE_TURN_ORDER: PersonaId[] = ["pro", "con", "neutral"];
export const TURNS_PER_ROUND = DEBATE_TURN_ORDER.length;
export const DEFAULT_TURN_INTERVAL_MS = 4_000;

export const PERSONAS: Record<PersonaId, Persona> = {
  pro: {
    id: "pro",
    name: "찬성 AI",
    role: "찬성 근거를 정리",
    color: "#22c55e",
    emoji: "🟢",
  },
  con: {
    id: "con",
    name: "반대 AI",
    role: "반대 근거를 정리",
    color: "#ef4444",
    emoji: "🔴",
  },
  neutral: {
    id: "neutral",
    name: "중립 AI",
    role: "양쪽 논점을 정리",
    color: "#3b82f6",
    emoji: "🔵",
  },
  moderator: {
    id: "moderator",
    name: "사회자 AI",
    role: "토론 진행",
    color: "#a855f7",
    emoji: "🟣",
  },
};

export function getNextPersona(_round: number, messageCount: number): PersonaId {
  return DEBATE_TURN_ORDER[messageCount % TURNS_PER_ROUND];
}

export function getPersona(id: PersonaId): Persona {
  return PERSONAS[id];
}
