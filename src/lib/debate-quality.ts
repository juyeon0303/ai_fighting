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
  "양측 모두",
  "조건부 접근",
  "설득력 있습니다",
  "일리가 있습니다",
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

const STIFF_FORMAL_MARKERS = [
  "이론적으로",
  "논리적으로",
  "정밀하게",
  "충분히",
  "것으로 보",
  "할 수 있",
  "치부할",
  "가능합니다",
  "것입니다",
  "찬성 쪽임",
  "반대 쪽임",
  "찬성 쪽",
  "반대 쪽",
  "전반적으로",
  "관측 결과가",
  "일치하는 걸 보면",
];

/** 해설·논문·격식체 */
export function isTooFormalForDebate(text: string): boolean {
  if (/습니다|입니다|됩니다|하십시오|겠습니다|였습니다|해요|세요/.test(text)) {
    return true;
  }
  return STIFF_FORMAL_MARKERS.some((m) => text.includes(m));
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

/** 주제·도메인과 안 맞는 팩트/발언 (양자→洋瓷 등) */
export function hasTopicDomainMismatch(
  ctx: TopicContext,
  content: string,
): boolean {
  const topicBlob = `${ctx.topic} ${ctx.debateQuestion}`;

  if (ctx.domain === "science" && /양자|다세계|불멸|역학|중첩/.test(topicBlob)) {
    if (/洋瓷|陶瓷|兩者|도자기|양자\(洋|양자\(瓷/.test(content)) return true;
    if (/두 사람 또는 사물|일정 관계에 있는/.test(content)) return true;
  }

  return false;
}

/** 문장이 중간에 끊긴 경우 */
export function isIncompleteTurn(content: string): boolean {
  const t = content.trim();
  if (t.length < 15) return true;
  if (/[.!?…다임함요봄해줘]\s*$/.test(t)) return false;
  if (/(?:마다|에서|하여|이고|으며|라서|도록|처럼|듯,|가지)$/.test(t)) {
    return true;
  }
  return false;
}

/** 선수·팀 등 검증 DB에 있는 대상의 팩트 오류 */
export function hasGroundTruthViolation(
  ctx: TopicContext,
  personaId: PersonaId,
  content: string,
): boolean {
  const side =
    personaId === "atlas"
      ? ctx.sideA
      : personaId === "cipher"
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
  const offset = personaId === "atlas" ? 0 : personaId === "cipher" ? 1 : 2;
  const idx = (round - 1 + offset) % angles.length;
  return angles[idx] ?? angles[0];
}

/** 찬반중립 토론 프레이밍 */
export function usesDebateStanceFraming(content: string): boolean {
  return /찬성|반대|중립|찬성임|반대임|옹호\s*입장|반대\s*입장/.test(content);
}

export function acceptDebateTurn(
  history: DebateMessage[],
  personaId: PersonaId,
  content: string,
  ctx?: TopicContext,
): boolean {
  if (isEssayTone(content)) return false;
  if (usesDebateStanceFraming(content)) return false;
  if (isTooFormalForDebate(content)) return false;
  if (isTooRepetitive(history, content, personaId)) return false;
  if (hasAwkwardSourceCitation(content)) return false;
  if (ctx) {
    if (hasGroundTruthViolation(ctx, personaId, content)) return false;
    if (hasTopicDomainMismatch(ctx, content)) return false;
  }
  if (isIncompleteTurn(content)) return false;
  return true;
}
