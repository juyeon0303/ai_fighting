import type { PersonaId } from "./types";

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

export function maxOutputTokens(
  personaId: PersonaId,
  tokenSaveMode = false,
): number {
  return tokenSaveMode
    ? SAVE_OUTPUT_TOKENS[personaId]
    : OUTPUT_TOKENS[personaId];
}

/** 완결 문장 경계 — 공백 뒤에서만 분리 */
const SENTENCE_SPLIT =
  /(?<=[.!?…]|다|임|함|요|죠|까|네|군|줘|봐|래|야|어|냐|데|잖아|거야|같아|거든|지|오|편|셈|뿐)\s+/;

/** 명확한 완결 어미 */
const COMPLETE_TAIL =
  /(?:습니다|입니다|거예요|했어요|해요|예요|에요|네요|군요|세요|더라|거든|잖아|같아|거야|할게|할래|맞아|그래|거지|겠다|겠어|겠지|아니야|그렇지|맞지|알겠지|그런지|그치|아니지|싶지|않지|재밌지|모르겠는데|잘 모르겠는데|편이야|텐데|니까|는데|라니까|다니까|ㅋㅋ|ㅎㅎ|다|요|죠|까|함|임|줘|봐|봤어|했어|좋아|싫어|아니|래|네|군|뿐)\s*$/;

/** 중간에 끊긴 패턴 */
const INCOMPLETE_TAIL =
  /(?:마다|에서|하여|이고|으며|라서|도록|처럼|같고|있고|없고|보면|때문|경우|것은|것이|있는|없는|되는|하는|이라|라는|으로|로서|위해|통해|대해|관해|따라|부터|마저|조차|밖에|뿐|만큼|정도|짓$|되$|하$|싶$|같$|줄$|올$|볼$|릴$|할$|될$|적$|법$|척$|하며$|이며$|라며$|면서$|면$|고$|서$|게$|듯$|듯한$|같은$|없$|있$|하는$|되는$|하려$|하려고$|하다$|이다$|한다$|된다$|겠$|였$|었$)\s*$/;

/** 발언 전체가 완결 문장인지 */
export function isTurnComplete(content: string): boolean {
  const t = content.trim();
  if (t.length < 8) return false;
  if (/[.!?…]\s*$/.test(t)) return true;
  if (COMPLETE_TAIL.test(t)) return true;
  if (INCOMPLETE_TAIL.test(t)) return false;
  return false;
}

/** @deprecated isTurnComplete 사용 */
export function isIncompleteTurn(content: string): boolean {
  return !isTurnComplete(content);
}

/** 끊긴 마지막 조각을 버리고 완결 문장만 남김 — 없으면 빈 문자열 */
export function extractCompleteTurnText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const segments = normalized.split(SENTENCE_SPLIT);
  const kept: string[] = [];

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;
    if (!isTurnComplete(s)) break;
    kept.push(s);
  }

  if (kept.length > 0) {
    return kept.join(" ").trim();
  }

  return isTurnComplete(normalized) ? normalized : "";
}

function clampAtSentenceBoundary(text: string, maxChars: number): string {
  const segments = text.split(SENTENCE_SPLIT);
  let out = "";

  for (const seg of segments) {
    const s = seg.trim();
    if (!s || !isTurnComplete(s)) break;
    const next = out ? `${out} ${s}` : s;
    if (next.length > maxChars) break;
    out = next;
  }

  return out.trim();
}

/** 절약 모드만 문장 경계로 짧게 — 불완전 조각은 절대 반환하지 않음 */
export function clampTurnContent(
  content: string,
  _personaId: PersonaId,
  tokenSaveMode = false,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!tokenSaveMode) return extractCompleteTurnText(normalized);
  return clampAtSentenceBoundary(normalized, SAVE_MODE_MAX_CHARS);
}
