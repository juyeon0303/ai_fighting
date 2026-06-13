import type { Persona, PersonaId } from "./types";

export const PERSONAS: Record<PersonaId, Persona> = {
  pro: {
    id: "pro",
    name: "찬성 AI",
    role: "적극적 옹호자",
    color: "#22c55e",
    emoji: "🟢",
  },
  con: {
    id: "con",
    name: "반대 AI",
    role: "날카로운 비판가",
    color: "#ef4444",
    emoji: "🔴",
  },
  neutral: {
    id: "neutral",
    name: "중립 AI",
    role: "균형 잡힌 분석가",
    color: "#3b82f6",
    emoji: "🔵",
  },
  moderator: {
    id: "moderator",
    name: "사회자 AI",
    role: "토론 진행자",
    color: "#a855f7",
    emoji: "🟣",
  },
};

const TURN_ORDER: PersonaId[] = ["moderator", "pro", "con", "neutral"];

export function getNextPersona(round: number, messageCount: number): PersonaId {
  if (messageCount === 0) return "moderator";
  const index = messageCount % TURN_ORDER.length;
  return TURN_ORDER[index];
}

export function getPersona(id: PersonaId): Persona {
  return PERSONAS[id];
}
