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

export function maxOutputTokens(
  personaId: PersonaId,
  tokenSaveMode = false,
): number {
  return tokenSaveMode
    ? SAVE_OUTPUT_TOKENS[personaId]
    : OUTPUT_TOKENS[personaId];
}

const SENTENCE_SPLIT =
  /(?<=[.!?…]|다|임|함|요|죠|까|네|군|줘|봐|래|야|어|냐|데|잖아|거야|같아|거든|지|오|편|셈|뿐|ㅋ|ㅎ)\s+/;

const COMPLETE_TAIL =
  /(?:습니다|입니다|거예요|했어요|해요|예요|에요|네요|군요|세요|더라|거든|잖아|같아|거야|할게|할래|맞아|그래|거지|겠다|겠어|겠지|아니야|그렇지|맞지|알겠지|그치|인정|ㄹㅇ|ㅇㅇ|모르겠|편이야|텐데|니까|는데|라니까|다니까|ㅋㅋ|ㅎㅎ|지|네|나|걸|래|다|요|죠|까|함|임|줘|봐|봤어|했어|좋아|싫어|아니|뿐)\s*$/;

const INCOMPLETE_TAIL =
  /(?:까지(?:는|도)?|정도(?:까지)?|수준(?:까지)?|하려(?:고)?|할\s*수\s*있(?:는|을)?|것(?:은|이)?|하다\s*가)\s*다\s*$|(?:짓|하|쓰|보|릴|할|될|싶|같|줄|올|볼|단정)\s*$/;

export function isTurnComplete(content: string): boolean {
  const t = content.trim();
  if (t.length < 4) return false;
  if (/^(?:ㅇㅇ|그치|맞아|인정|ㄹㅇ|ㅋㅋ|ㅎㅎ)$/u.test(t)) return true;
  if (/[.!?…?]\s*$/.test(t)) return true;
  if (INCOMPLETE_TAIL.test(t)) return false;
  if (COMPLETE_TAIL.test(t)) return true;
  return t.length >= 12;
}

export function isIncompleteTurn(content: string): boolean {
  return !isTurnComplete(content);
}

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

  if (kept.length > 0) return kept.join(" ").trim();
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

export function clampTurnContent(
  content: string,
  _personaId: PersonaId,
  tokenSaveMode = false,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!tokenSaveMode) return extractCompleteTurnText(normalized);
  return clampAtSentenceBoundary(normalized, SAVE_MODE_MAX_CHARS);
}
