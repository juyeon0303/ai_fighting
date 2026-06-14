import type { DebateMessage, PersonaId } from "./types";
import { personaDisplayName, providerFromMessageSource } from "./personas";

/** 발언 1회 최대 출력 토큰 */
export const OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 384,
  cipher: 384,
  ember: 384,
};

/** 프롬프트에 넣을 직전 발언 수 (3라운드 분) */
export const HISTORY_LIMIT = 9;

/** 직전 발언 1개당 최대 글자 */
export const HISTORY_SNIPPET_CHARS = 220;

export function maxOutputTokens(personaId: PersonaId): number {
  return OUTPUT_TOKENS[personaId];
}

export function truncateForPrompt(text: string, max = HISTORY_SNIPPET_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** 대화 히스토리 — LLM이 그대로 읽도록 */
export function compactHistory(history: DebateMessage[]): string {
  if (history.length === 0) return "(없음)";
  return history
    .slice(-HISTORY_LIMIT)
    .map(
      (m) =>
        `${personaDisplayName(m.personaId, providerFromMessageSource(m.llmSource))}: ${truncateForPrompt(m.content)}`,
    )
    .join("\n");
}

/** 문장이 중간에 끊긴 경우 */
export function isIncompleteTurn(content: string): boolean {
  const t = content.trim();
  if (t.length < 18) return true;
  if (
    /[.!?…]\s*$/.test(t) ||
    /(?:다|임|함|요|봄|해|네|지|야|어|냐|데|잖아|거야|같아|거든|래|셈이야)\s*$/.test(t)
  ) {
    return false;
  }
  if (/(?:마다|에서|하여|이고|으며|라서|도록|처럼|듯|같고|있고|없고|보면|때문|충돌하며|경우|것은|것이|있는|없는|되는|하는|이라|라는|으로|로서)$/.test(t)) {
    return true;
  }
  return false;
}

/** 너무 긴 응답만 자르기 — 문장 경계 우선 */
export function clampTurnContent(content: string, _personaId: PersonaId): string {
  const maxChars = 500;
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  const sentences = normalized.split(/(?<=[.!?…]|다|임|함|요|봄|해|네|지)\s+/);
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > maxChars) break;
    out = next;
  }
  if (out.length >= 24) return out.trim();

  return truncateForPrompt(normalized, maxChars);
}
