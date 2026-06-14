import type { DebateMessage, PersonaId } from "./types";
import { personaDisplayName, providerFromMessageSource } from "./personas";

/** 발언 1회 최대 출력 토큰 */
export const OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 256,
  cipher: 256,
  ember: 256,
};

/** 프롬프트에 넣을 직전 발언 수 */
export const HISTORY_LIMIT = 6;

/** 직전 발언 1개당 최대 글자 */
export const HISTORY_SNIPPET_CHARS = 200;

export function maxOutputTokens(personaId: PersonaId): number {
  return OUTPUT_TOKENS[personaId];
}

function truncateSnippet(text: string, max = HISTORY_SNIPPET_CHARS): string {
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
        `${personaDisplayName(m.personaId, providerFromMessageSource(m.llmSource))}: ${truncateSnippet(m.content)}`,
    )
    .join("\n");
}

/** 너무 긴 응답만 자르기 */
export function clampTurnContent(content: string, _personaId: PersonaId): string {
  const maxChars = 400;
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}
