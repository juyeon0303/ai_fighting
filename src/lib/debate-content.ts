import type { DebateMessage, PersonaId } from "./types";
import type { DebateMode, TopicContext, TopicDomain } from "./topic-context";
import { getGeniusLens } from "./topic-context";
import { DEBATE_TURN_ORDER } from "./personas";
import { DEBATE_STYLE, DEBATE_BAD_EXAMPLES, FRIEND_TONE_RULE } from "./debate-style";
import {
  clampTurnContent,
  compactHistory,
  softenFormalTone,
} from "./debate-turn-budget";
import type { DebateSources } from "./debate-sources";
import { factCueForPrompt } from "./debate-sources";
import { FRESHNESS_RULE, pickNovelLens } from "./debate-novelty";
import {
  acceptDebateTurn,
  bannedPhraseReminder,
  isTooFormalForDebate,
  roundFocusAngle,
} from "./debate-quality";

const BANNED_VAGUE = [
  "양측 모두",
  "조건부 접근",
  "설득력 있습니다",
  "타당합니다",
  "것으로 보입니다",
  "할 수 있습니다",
  "이해관계자",
  "일리가 있습니다",
  "일리가 있",
  "핵심이 드러",
  "둘러싼 토론",
  "을 둘러싼",
  "일부만 맞",
  "옹호 입장",
  "찬성 측",
  "반대 측",
  "관점으로 말",
  "논의를 정리",
  "더 강합니다",
  "강조합니다",
  "간과했",
  "주제에서 벗어나지",
  "말해주세요",
  "하세요",
  "말싸움",
  "싸운다",
  "참고로 위키",
  "라고 설명한다",
  "이 내용과 논점",
  "찬성 입장에서는",
  "반대 입장에서는",
  "뒷받침한다",
  "비교 기준이 애매하다",
  "논리에는 한계가 있다",
  "에서 강점이 있고",
  "유일무이",
  "입증",
  "견인",
  "정교한",
  "대변한다",
  "상회한다",
  "마땅하다",
  "이론적으로",
  "논리적으로",
  "정밀하게",
  "충분히",
  "전반적으로",
  "찬성 쪽",
  "반대 쪽",
  "것으로 보",
  "할 수 있",
  "치부할",
];

const BANNED_GENERIC = [
  "사회적 비용",
  "기회비용",
  "역사적으로 혁신",
  "적절한 규제와 함께",
  "점진적 도입과 지속적 모니터링",
];

function hasBannedGeneric(text: string): boolean {
  return [...BANNED_GENERIC, ...BANNED_VAGUE].some((b) => text.includes(b));
}

const DOMAIN_HINTS: Record<
  TopicDomain,
  { atlas: string[]; cipher: string[]; ember: string[] }
> = {
  esports: {
    atlas: ["월드 성적", "라인전 장악력", "팀 기여도", "메타 적응", "클러치 장면"],
    cipher: ["최근 폼", "라인전 밀림", "팀플레이 한계", "메타 변화 적응 실패"],
    ember: ["시즌별 편차", "팀 환경", "포지션 차이", "비교 기준 설정"],
  },
  food: {
    atlas: ["맛의 깊이", "만족감", "가성비", "식사 경험", "조합의 다양성"],
    cipher: ["질림", "건강 부담", "가격", "일관성 부족", "과대평가"],
    ember: ["취향 차이", "상황별 적합성", "메뉴 편차"],
  },
  tech: {
    atlas: ["생산성", "생태계", "유지보수성", "확장성", "사용자 경험"],
    cipher: ["러닝커브", "레거시 부담", "의존성", "복잡도", "비용"],
    ember: ["팀 규모", "프로젝트 성격", "장기 운영 관점"],
  },
  entertainment: {
    atlas: ["대중성", "완성도", "영향력", "재미", "문화적 파급"],
    cipher: ["피로감", "상업성 과잉", "깊이 부족", "유행 의존"],
    ember: ["취향", "세대 차이", "감상 맥락"],
  },
  social: {
    atlas: ["실용성", "삶의 질", "관계 개선", "효율", "행복감"],
    cipher: ["부작용", "불평등", "스트레스", "현실적 한계"],
    ember: ["개인차", "환경", "조건부 적용"],
  },
  science: {
    atlas: [
      "실험·관측이 이론을 뒷받침",
      "수식 예측이 실제와 맞음",
      "반복 검증에서 살아남음",
    ],
    cipher: [
      "반례 실험이 존재",
      "관측으로 아직 증명 못 함",
      "이론 전제가 허약함",
    ],
    ember: [
      "용어 정의부터 다름",
      "가능/불가능 기준이 애매",
      "증거 부족해서 성급한 결론은 위험",
    ],
  },
  general: {
    atlas: ["실질적 이점", "경험상 가치", "합리적 근거", "긍정적 효과"],
    cipher: ["한계", "부정적 측면", "대안 우위", "현실적 문제"],
    ember: ["맥락", "조건", "균형"],
  },
};


function hasAnchor(ctx: TopicContext, text: string): boolean {
  return ctx.anchors.some((a) => a.length >= 2 && text.includes(a));
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export function validateResponse(
  ctx: TopicContext,
  personaId: PersonaId,
  content: string,
): ValidationResult {
  const issues: string[] = [];

  if (hasBannedGeneric(content)) {
    issues.push("generic_policy_phrase");
  }

  if (isTooFormalForDebate(content)) {
    issues.push("formal_tone");
  }

  if (!hasAnchor(ctx, content)) {
    issues.push("missing_anchor");
  }

  if (content.length < 12) issues.push("too_short");

  return { ok: issues.length === 0, issues };
}

/** API 응답에 주제·이름이 빠졌을 때 자연스럽게 보강 */
export function ensureTopicInTurn(
  ctx: TopicContext,
  _personaId: PersonaId,
  content: string,
): string {
  if (hasAnchor(ctx, content)) return content;

  const hook = ctx.displayTopic || ctx.topic;
  const short = hook.length > 28 ? `${hook.slice(0, 26)}…` : hook;
  if (/^(난|나는)\s/.test(content)) {
    return content.replace(/^(난|나는)/, `$1 ${short}`);
  }
  return `${short} 얘기면 ${content}`;
}

/** Gemini/GPT 출력 — 과한 검열 대신 보정 후 통과 */
export function polishApiResponse(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  raw: string,
): string | null {
  let text = softenFormalTone(raw);
  text = softenFormalTone(text);
  text = clampTurnContent(text, personaId);
  text = ensureTopicInTurn(ctx, personaId, text);
  text = softenFormalTone(text);

  if (text.length < 12) return null;
  if (!acceptDebateTurn(history, personaId, text, ctx)) return null;

  const issues = validateResponse(ctx, personaId, text).issues.filter(
    (issue) => issue !== "missing_anchor" && issue !== "formal_tone",
  );
  if (issues.length > 0) return null;

  return text;
}

export function apiPolishRejectHint(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  raw: string,
): string {
  const polished = polishApiResponse(ctx, personaId, history, raw);
  if (polished) return "";

  const softened = softenFormalTone(raw);
  const clamped = clampTurnContent(softened, personaId);
  if (clamped.length < 12) return "1~2문장으로 짧게";
  if (!acceptDebateTurn(history, personaId, clamped, ctx)) {
    return "친구 반말로, 반복·위키인용·중립편들기 없이";
  }
  if (hasBannedGeneric(clamped)) return "뻔한 정책 말투 빼고";
  return `${ctx.displayTopic || ctx.topic} 키워드 포함해서`;
}

export async function generateMockTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId = "local",
): Promise<string> {
  const { generateSmartTurn } = await import("./smart-debate-engine");
  return generateSmartTurn(ctx, personaId, history, round, debateId);
}

function modeRules(ctx: TopicContext): string {
  const rules: Record<DebateMode, string> = {
    versus: `비교:${ctx.sideA} vs ${ctx.sideB}|이름 자연스럽게`,
    comparison: `비교:${ctx.sideA}·${ctx.sideB}|입장 나누지 말 것`,
    proposition: `질문:${ctx.debateQuestion}`,
    choice: `후보 달리|${ctx.topic}`,
    wh_question: `Q:${ctx.debateQuestion}`,
    casual: `입력「${ctx.topic}」→${ctx.debateQuestion}`,
    topic: ctx.debateQuestion,
  };
  return rules[ctx.mode];
}

export function passesMinimumQuality(
  ctx: TopicContext,
  _personaId: PersonaId,
  content: string,
): boolean {
  const text = content.trim();
  if (text.length < 12) return false;
  return hasAnchor(ctx, text);
}

function personaHint(
  personaId: PersonaId,
  hints: (typeof DOMAIN_HINTS)[TopicDomain],
  round: number,
): string {
  const pool = hints[personaId];
  return roundFocusAngle(personaId, pool, round);
}

function rebuttalRule(personaId: PersonaId, round: number): string {
  if (round <= 1) return "";
  return "직전발언인용후이어서말할것.찬반중립입장금지.";
}

function exampleLine(ctx: TopicContext, personaId: PersonaId): string {
  const examples: Record<PersonaId, string> = {
    atlas: `예:난 ${ctx.topic} 보면 큰 그림부터 이렇게 보거든.`,
    cipher: `예:논리만 따지면 ${ctx.topic}은 정의부터 애매해.`,
    ember: `예:비유하자면 ${ctx.topic}은 이렇게 느껴져.`,
  };
  if (ctx.sideA && ctx.sideB) {
    return `예:난 ${ctx.sideA}랑 ${ctx.sideB} 둘 다 보면 변수가 갈려.`;
  }
  return examples[personaId];
}

export function buildDebatePrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources?: DebateSources | null,
): string {
  const lens = getGeniusLens(personaId, ctx);
  const hints = DOMAIN_HINTS[ctx.domain];
  const lastPeer = history.length > 0 ? history[history.length - 1] : null;

  const peerLine = lastPeer
    ? `직전:${truncateSnippet(lastPeer.content, 80)}`
    : "";

  const factLine = sources
    ? factCueForPrompt(sources, ctx, personaId, history, round)
    : null;

  return [
    `주제:${ctx.topic}`,
    `시각:${lens}`,
    `R${round}`,
    modeRules(ctx),
    `이번각도:${personaHint(personaId, hints, round)}`,
    `신선렌즈:${pickNovelLens(ctx.domain, round, personaId)}`,
    factLine ? `팩트참고:${factLine}(출처말하지말것)` : null,
    `대화:${compactHistory(history)}`,
    `이미씀금지:${bannedPhraseReminder(history)}`,
    peerLine,
    rebuttalRule(personaId, round),
    DEBATE_STYLE,
    FRIEND_TONE_RULE,
    FRESHNESS_RULE,
    `금지:${DEBATE_BAD_EXAMPLES}`,
    exampleLine(ctx, personaId),
  ]
    .filter(Boolean)
    .join("\n");
}

function truncateSnippet(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function simulateFullRound(
  topic: string,
  generate: (
    topic: string,
    personaId: PersonaId,
    history: DebateMessage[],
    round: number,
  ) => Promise<string>,
): Promise<{ ctx: TopicContext; messages: DebateMessage[]; validations: ValidationResult[] }> {
  const { parseTopic } = await import("./topic-context");
  const ctx = parseTopic(topic);
  const order = DEBATE_TURN_ORDER;
  const messages: DebateMessage[] = [];
  const validations: ValidationResult[] = [];

  for (const personaId of order) {
    const content = await generate(topic, personaId, messages, 1);
    const v = validateResponse(ctx, personaId, content);
    validations.push(v);
    messages.push({
      id: `sim-${personaId}`,
      debateId: "sim",
      personaId,
      content,
      round: 1,
      createdAt: new Date().toISOString(),
    });
  }

  return { ctx, messages, validations };
}
