import type { DebateMessage, PersonaId } from "./types";

/** 발언 1회 최대 출력 토큰 */
export const OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 8192,
  cipher: 8192,
  ember: 8192,
};

export function maxOutputTokens(personaId: PersonaId): number {
  return OUTPUT_TOKENS[personaId];
}

/** 문장이 중간에 끊긴 경우 */
export function isIncompleteTurn(content: string): boolean {
  const t = content.trim();
  if (t.length < 12) return true;
  if (
    /[.!?…]\s*$/.test(t) ||
    /(?:다|임|함|요|봄|해|네|지|야|어|냐|데|잖아|거야|같아|거든|래|셈이야|거지|거든|네|줘)\s*$/.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /(?:마다|에서|하여|이고|으며|라서|도록|처럼|듯|같고|있고|없고|보면|때문|충돌하며|경우|것은|것이|있는|없는|되는|하는|이라|라는|으로|로서|위해|통해)$/.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** 글자수 제한 없음 — 공백만 정리 */
export function clampTurnContent(content: string, _personaId: PersonaId): string {
  return content.replace(/\s+/g, " ").trim();
}
