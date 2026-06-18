import type { PersonaId } from "./types";

const OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 640,
  cipher: 640,
  ember: 640,
};

const SAVE_OUTPUT_TOKENS: Record<PersonaId, number> = {
  atlas: 512,
  cipher: 512,
  ember: 512,
};

export const SAVE_MODE_MAX_CHARS = 480;
export const TURN_MAX_CHARS = 720;

export function maxOutputTokens(
  personaId: PersonaId,
  tokenSaveMode = false,
): number {
  return tokenSaveMode
    ? SAVE_OUTPUT_TOKENS[personaId]
    : OUTPUT_TOKENS[personaId];
}

/** 문장 경계 — 마침표·느낌표만 (한글 조사로 쪼개지 않음) */
const STRONG_SENTENCE_SPLIT = /(?<=[.!?…])\s+/;

/** 중간에 끊긴 발언 패턴 */
const INCOMPLETE_TAIL =
  /(?:까지(?:는|도)?|정도(?:까지)?|수준(?:까지)?|하려(?:고)?|할\s*수\s*있(?:는|을)?|것(?:은|이)?|하다\s*가)\s*다\s*$|(?:짓|쓰|보|릴|될|싶|줄|올|볼|뜨는|읽|쥐|마시|포장|통제|구분|이용|배우|연구|정리|설명|말하|생각|판단|결정|선택|고민|파악|대처|방어|공격|찌르|휘두|지키|유지|확인|이해|분석|비교|반박)\s*$/;

const DANGLING_CONNECTIVE_TAIL =
  /(?:쓸지|할지|볼지|갈지|올지|줄지|둘지|될지|(?:을|를|는|은)?인지|(?:을|를|는|은)?는지|해야|하려고|하려|하면|하는|하다|하기|하거나|알아야|가야|와야|이어야|없이|위해|대해|에서|이라|이랑)\s*$/u;

const COMPLETE_CASUAL_TAIL =
  /(?:습니다|입니다|거예요|했어요|해요|예요|에요|네요|군요|세요|더라|거든|잖아|같아|거야|할게|할래|맞아|그래|거지|겠다|겠어|겠지|아니야|그렇지|맞지|알겠지|그치|인정|ㄹㅇ|ㅇㅇ|모르겠|편이야|텐데|라니까|다니까|ㅋㅋ|ㅎㅎ|봤어|했어|좋아|싫어|아니|거잖아|하거든|하니까|하네|하냐|하잖아|않아|않냐|없냐|있냐|구나|다|요|죠|까|네|줘|봐|함|임|뿐|없지|있지|맞긴\s*해|맞아|인정해)\s*$/u;

function passesCompleteRules(t: string, strict: boolean): boolean {
  if (t.length < 4) return false;
  if (/^(?:ㅇㅇ|그치|맞아|인정|ㄹㅇ|ㅋㅋ|ㅎㅎ)$/u.test(t)) return true;
  if (/[.!?…]\s*$/.test(t)) return true;
  if (INCOMPLETE_TAIL.test(t)) return false;
  if (DANGLING_CONNECTIVE_TAIL.test(t)) return false;

  if (strict) {
    if (!/(?:[.!?…]|다|요|죠|까|네|거야|거잖아|잖아|거든|맞아|그래|아니야|ㅋㅋ|ㅎㅎ|없지|있지|맞지|않아|않냐|없냐|있냐|하자|할게)\s*$/u.test(t)) {
      return false;
    }
  }

  if (COMPLETE_CASUAL_TAIL.test(t)) return true;

  if (strict) return false;

  if (
    /(?:다르지|아닐까|할까|있지|없지|같지|맞지|거지|인데|거든|잖아|니까|는데|그렇지|맞지|위험하지|어렵지|하거든)\s*$/u.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

/** 발언이 문장 끝까지 완결됐는지 */
export function isTurnComplete(
  content: string,
  opts?: { strict?: boolean },
): boolean {
  return passesCompleteRules(content.trim(), opts?.strict ?? false);
}

export function isIncompleteTurn(content: string): boolean {
  return !isTurnComplete(content);
}

/** 끝에 끊긴 조각만 제거 — 앞 문장은 그대로 유지 */
export function extractCompleteTurnText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (isTurnComplete(normalized)) return normalized;

  const byPeriod = normalized.split(STRONG_SENTENCE_SPLIT);
  if (byPeriod.length > 1) {
    const complete = byPeriod.filter((s) => isTurnComplete(s.trim()));
    if (complete.length > 0) {
      return complete.join(" ").trim();
    }
  }

  const clauses = normalized.split(/,\s+/);
  if (clauses.length > 1) {
    const last = clauses[clauses.length - 1]!.trim();
    if (!isTurnComplete(last)) {
      const head = clauses.slice(0, -1).join(", ").trim();
      if (isTurnComplete(head)) return head;
    }
  }

  return "";
}

function clampAtSentenceBoundary(text: string, maxChars: number): string {
  const segments = text.split(STRONG_SENTENCE_SPLIT);
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

export function clampTurnContent(
  content: string,
  _personaId: PersonaId,
  tokenSaveMode = false,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  if (isTurnComplete(normalized)) {
    if (!tokenSaveMode || normalized.length <= SAVE_MODE_MAX_CHARS) {
      return normalized;
    }
  }

  if (!tokenSaveMode) {
    return extractCompleteTurnText(normalized);
  }

  const clamped = clampAtSentenceBoundary(normalized, SAVE_MODE_MAX_CHARS);
  if (clamped) return clamped;

  const extracted = extractCompleteTurnText(normalized);
  if (extracted) return extracted;

  return "";
}

/** API 잘림·필터 후에도 쓸 수 있는 마지막 완결 구간 */
export function salvageTurnText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const extracted = extractCompleteTurnText(normalized);
  if (extracted && isTurnComplete(extracted, { strict: true })) {
    return extracted.length <= maxChars
      ? extracted
      : clampAtSentenceBoundary(extracted, maxChars);
  }

  return "";
}
