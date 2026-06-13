import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import { speechViolatesGroundTruth } from "./domain-ground-truth";

const ESSAY_MARKERS = [
  "압도적인",
  "압도적",
  "유일무이",
  "견인",
  "입증",
  "증명한다",
  "증명하고",
  "정교한",
  "대변한다",
  "상회한다",
  "마땅하다",
  "독보적인",
  "독보적",
  "결정적인",
  "실질적인",
];

const REPEAT_PHRASES = [
  "월즈",
  "월드",
  "우승",
  "라인전",
  "지표",
  "압도",
  "유일",
  "입증",
  "증명",
  "커리어",
  "영광",
  "퍼포먼스",
  "체급",
];

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .replace(/[^\p{L}\p{N}]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2),
  );
}

function overlapRatio(a: string, b: string): number {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0) return 0;
  let shared = 0;
  for (const w of wa) {
    if (wb.has(w)) shared++;
  }
  return shared / wa.size;
}

/** 뉴스·해설 기사 톤 */
export function isEssayTone(text: string): boolean {
  const hits = ESSAY_MARKERS.filter((m) => text.includes(m)).length;
  return hits >= 2;
}

/** 중립이 한쪽 편을 드는 경우 */
export function isNeutralTakingSide(
  ctx: TopicContext,
  content: string,
): boolean {
  if (ctx.mode !== "versus" && ctx.mode !== "comparison") return false;
  if (!ctx.sideA || !ctx.sideB) return false;

  if (/나는\s*.{0,10}(편|쪽)/.test(content)) return true;

  const hasA = content.includes(ctx.sideA);
  const hasB = content.includes(ctx.sideB);
  const bias = /압도적|더\s*낫|우위|뛰어나|설득력|낫다고\s*봄|최적화/;

  if (hasA && !hasB && bias.test(content)) return true;
  if (hasB && !hasA && bias.test(content)) return true;
  if (/나는/.test(content) && (hasA || hasB)) return true;

  return false;
}

/** 위키·자료 인용 티가 나는 어색한 문장 */
export function hasAwkwardSourceCitation(content: string): boolean {
  return /위키|자료상|참고로\s*위키|흔한\s*말\s*말고|쪽이\s*포인트임|\(위키\)/.test(
    content,
  );
}

/** 선수·팀 팩트 오류 (예: 쵸비=T1) */
export function hasGroundTruthViolation(
  ctx: TopicContext,
  personaId: PersonaId,
  content: string,
): boolean {
  if (ctx.domain !== "esports") return false;

  const side =
    personaId === "pro"
      ? ctx.sideA
      : personaId === "con"
        ? ctx.sideB
        : null;
  if (side && speechViolatesGroundTruth(side, content)) return true;

  return false;
}

/** 중립이 찬/반 요약 템플릿으로 도는 경우 */
export function isNeutralSummaryTemplate(text: string): boolean {
  if (!/찬성|반대|반면/.test(text)) return false;
  return /찬성.+반(대|면)|반(대|면).+찬성/.test(text);
}

/** 직전 발언과 논점·표현이 겹치면 돌림노래 */
export function isTooRepetitive(
  history: DebateMessage[],
  content: string,
  personaId: PersonaId,
): boolean {
  const sameSide = history.filter((m) => m.personaId === personaId).slice(-2);
  for (const prev of sameSide) {
    if (overlapRatio(prev.content, content) > 0.42) return true;
  }

  const recent = history.slice(-4);
  for (const prev of recent) {
    if (prev.personaId === personaId) continue;
    if (overlapRatio(prev.content, content) > 0.38) return true;
  }

  const used = new Set<string>();
  for (const m of history.slice(-8)) {
    for (const p of REPEAT_PHRASES) {
      if (m.content.includes(p)) used.add(p);
    }
  }

  let reused = 0;
  for (const p of REPEAT_PHRASES) {
    if (used.has(p) && content.includes(p)) reused++;
  }
  return reused >= 2;
}

export function bannedPhraseReminder(history: DebateMessage[]): string {
  const used = new Set<string>();
  for (const m of history.slice(-8)) {
    for (const p of REPEAT_PHRASES) {
      if (m.content.includes(p)) used.add(p);
    }
  }
  if (used.size === 0) return "-";
  return [...used].slice(0, 8).join(",");
}

export function roundFocusAngle(
  personaId: PersonaId,
  angles: string[],
  round: number,
): string {
  const offset = personaId === "pro" ? 0 : personaId === "con" ? 1 : 2;
  const idx = (round - 1 + offset) % angles.length;
  return angles[idx] ?? angles[0];
}

export function acceptDebateTurn(
  history: DebateMessage[],
  personaId: PersonaId,
  content: string,
  ctx?: TopicContext,
): boolean {
  if (isEssayTone(content)) return false;
  if (isTooRepetitive(history, content, personaId)) return false;
  if (hasAwkwardSourceCitation(content)) return false;
  if (personaId === "neutral" && isNeutralSummaryTemplate(content)) {
    return false;
  }
  if (ctx) {
    if (personaId === "neutral" && isNeutralTakingSide(ctx, content)) {
      return false;
    }
    if (hasGroundTruthViolation(ctx, personaId, content)) return false;
  }
  return true;
}
