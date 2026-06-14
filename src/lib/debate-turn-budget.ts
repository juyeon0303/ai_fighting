import type { DebateMessage, PersonaId } from "./types";

/** 발언 1회 최대 출력 토큰 — 의미 유지 최소 한도 */
export const OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 100,
  cipher: 100,
  ember: 120,
};

/** 프롬프트에 넣을 직전 발언 수 */
export const HISTORY_LIMIT = 3;

/** 직전 발언 1개당 최대 글자 (초과 시 말줄임) */
export const HISTORY_SNIPPET_CHARS = 90;

const PERSONA_SHORT: Record<PersonaId, string> = {
  atlas: "아",
  cipher: "사",
  ember: "엠",
};

export function maxOutputTokens(personaId: PersonaId): number {
  return OUTPUT_TOKENS[personaId];
}

function truncateSnippet(text: string, max = HISTORY_SNIPPET_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** 토큰 절약용 압축 히스토리 — 직전 반박 맥락만 */
export function compactHistory(history: DebateMessage[]): string {
  if (history.length === 0) return "-";
  return history
    .slice(-HISTORY_LIMIT)
    .map(
      (m) =>
        `${PERSONA_SHORT[m.personaId]}:${truncateSnippet(m.content)}`,
    )
    .join("|");
}

/** API가 길게 써도 1~2문장으로 자르기 (문장 경계 우선) */
export function clampTurnContent(content: string, personaId: PersonaId): string {
  const maxChars = personaId === "ember" ? 150 : 120;
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  const sentences = normalized.split(/(?<=[.!?…]|다|임|함|요)\s+/);
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > maxChars) break;
    out = next;
  }
  if (out.length >= 20) return out.trim();

  const cut = truncateSnippet(normalized, maxChars);
  if (!/[.!?…다임함요봄해]$/.test(cut)) {
    return cut.endsWith("…") ? cut : `${cut}…`;
  }
  return cut;
}

/** 격식체를 평서체로 가볍게 정리 — 재호출 없이 품질 보정 */
export function softenFormalTone(text: string): string {
  return text
    .replace(/습니다/g, "음")
    .replace(/입니다/g, "임")
    .replace(/됩니다/g, "됨")
    .replace(/겠습니다/g, "겠음")
    .replace(/였습니다/g, "였음")
    .replace(/할 수 있습니다/g, "할 수 있음")
    .replace(/할 수 있어요/g, "할 수 있음")
    .replace(/가능합니다/g, "가능함")
    .replace(/것입니다/g, "거임")
    .replace(/것으로 보입니다/g, "것 같음")
    .replace(/것으로 보여요/g, "것 같음")
    .replace(/이론적으로/g, "이론상")
    .replace(/논리적으로/g, "논리만 보면")
    .replace(/찬성 쪽임/g, "찬성임")
    .replace(/반대 쪽임/g, "반대임")
    .replace(/해주세요|하십시오|하세요/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
