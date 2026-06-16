import type { DebateMessage, PersonaId } from "./types";

/** 일반 모드 — 발언 1회 최대 출력 토큰 */
const OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 8192,
  cipher: 8192,
  ember: 8192,
};

/** 토큰절약 모드 — 짧은 완결 발언 */
const SAVE_OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 384,
  cipher: 384,
  ember: 384,
};

/** 절약 모드: 문장 단위로만 자름 (중간 끊김 방지) */
export const SAVE_MODE_MAX_CHARS = 300;
export const SAVE_MODE_FALLBACK_CHARS = 480;

export function maxOutputTokens(
  personaId: PersonaId,
  tokenSaveMode = false,
): number {
  return tokenSaveMode
    ? SAVE_OUTPUT_TOKENS[personaId]
    : OUTPUT_TOKENS[personaId];
}

const SENTENCE_SPLIT =
  /(?<=[.!?…]|다|임|함|요|지|야|어|냐|네|거야|같아|거든|잖아|래|줘)\s+/;

/** 문장이 중간에 끊긴 경우 */
export function isIncompleteTurn(content: string): boolean {
  const t = content.trim();
  if (t.length < 12) return true;
  if (
    /[.!?…]\s*$/.test(t) ||
    /(?:다|임|함|요|봄|해|네|지|야|어|냐|데|잖아|거야|같아|거든|래|셈이야|거지|네|줘)\s*$/.test(
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

function clampAtSentenceBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const sentences = text.split(SENTENCE_SPLIT);
  let out = "";
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const next = out ? `${out} ${trimmed}` : trimmed;
    if (next.length > maxChars) break;
    out = next;
  }
  if (out.length >= 16) return out.trim();

  // 한 문장이 길면 통째로 (중간 자르지 않음)
  const first = sentences.find((s) => s.trim().length >= 16)?.trim();
  if (first && first.length <= SAVE_MODE_FALLBACK_CHARS) return first;
  if (text.length <= SAVE_MODE_FALLBACK_CHARS) return text;

  return text;
}

/** 절약 모드만 문장 경계로 짧게 — 일반 모드는 제한 없음 */
export function clampTurnContent(
  content: string,
  _personaId: PersonaId,
  tokenSaveMode = false,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!tokenSaveMode) return normalized;
  return clampAtSentenceBoundary(normalized, SAVE_MODE_MAX_CHARS);
}
