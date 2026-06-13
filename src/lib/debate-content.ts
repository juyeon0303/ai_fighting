import type { DebateMessage, PersonaId } from "./types";
import type { DebateMode, TopicContext, TopicDomain } from "./topic-context";
import { getPersonaStance } from "./topic-context";
import { DEBATE_STYLE, DEBATE_BAD_EXAMPLES } from "./debate-style";
import { compactHistory } from "./debate-turn-budget";
import type { DebateSources } from "./debate-sources";
import { factCueForPrompt } from "./debate-sources";
import { FRESHNESS_RULE, pickNovelLens } from "./debate-novelty";
import {
  acceptDebateTurn,
  bannedPhraseReminder,
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
  "솔직히",
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
];

const FORMAL_PATTERN =
  /습니다|입니다|됩니다|하십시오|해주세요|하세요|겠습니다|였습니다/;

const DOMAIN_HINTS: Record<
  TopicDomain,
  { pro: string[]; con: string[]; neutral: string[] }
> = {
  esports: {
    pro: ["월드 성적", "라인전 장악력", "팀 기여도", "메타 적응", "클러치 장면"],
    con: ["최근 폼", "라인전 밀림", "팀플레이 한계", "메타 변화 적응 실패"],
    neutral: ["시즌별 편차", "팀 환경", "포지션 차이", "비교 기준 설정"],
  },
  food: {
    pro: ["맛의 깊이", "만족감", "가성비", "식사 경험", "조합의 다양성"],
    con: ["질림", "건강 부담", "가격", "일관성 부족", "과대평가"],
    neutral: ["취향 차이", "상황별 적합성", "메뉴 편차"],
  },
  tech: {
    pro: ["생산성", "생태계", "유지보수성", "확장성", "사용자 경험"],
    con: ["러닝커브", "레거시 부담", "의존성", "복잡도", "비용"],
    neutral: ["팀 규모", "프로젝트 성격", "장기 운영 관점"],
  },
  entertainment: {
    pro: ["대중성", "완성도", "영향력", "재미", "문화적 파급"],
    con: ["피로감", "상업성 과잉", "깊이 부족", "유행 의존"],
    neutral: ["취향", "세대 차이", "감상 맥락"],
  },
  social: {
    pro: ["실용성", "삶의 질", "관계 개선", "효율", "행복감"],
    con: ["부작용", "불평등", "스트레스", "현실적 한계"],
    neutral: ["개인차", "환경", "조건부 적용"],
  },
  science: {
    pro: [
      "실험·관측이 이론을 뒷받침",
      "수식 예측이 실제와 맞음",
      "반복 검증에서 살아남음",
    ],
    con: [
      "반례 실험이 존재",
      "관측으로 아직 증명 못 함",
      "이론 전제가 허약함",
    ],
    neutral: [
      "용어 정의부터 다름",
      "가능/불가능 기준이 애매",
      "증거 부족해서 성급한 결론은 위험",
    ],
  },
  general: {
    pro: ["실질적 이점", "경험상 가치", "합리적 근거", "긍정적 효과"],
    con: ["한계", "부정적 측면", "대안 우위", "현실적 문제"],
    neutral: ["맥락", "조건", "균형"],
  },
};


function hasAnchor(ctx: TopicContext, text: string): boolean {
  return ctx.anchors.some((a) => a.length >= 2 && text.includes(a));
}

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

function isTooFormal(text: string): boolean {
  return FORMAL_PATTERN.test(text);
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

  if (isTooFormal(content)) {
    issues.push("formal_tone");
  }

  if (personaId !== "moderator" && !hasAnchor(ctx, content)) {
    issues.push("missing_anchor");
  }

  if (
    (ctx.mode === "versus" || ctx.mode === "comparison") &&
    ctx.sideA &&
    ctx.sideB
  ) {
    if (personaId === "pro" && !content.includes(ctx.sideA)) {
      issues.push(`pro_missing_${ctx.sideA}`);
    }
    if (personaId === "con" && !content.includes(ctx.sideB)) {
      issues.push(`con_missing_${ctx.sideB}`);
    }
  }

  if (content.length < 12) issues.push("too_short");

  return { ok: issues.length === 0, issues };
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
    versus: `찬=${ctx.sideA}|반=${ctx.sideB}|이름 필수`,
    comparison: `찬=${ctx.sideA}우위|반=${ctx.sideB}우위`,
    proposition: `답:${ctx.debateQuestion}`,
    choice: `후보 달리|${ctx.topic}`,
    wh_question: `Q:${ctx.debateQuestion}`,
    casual: `입력「${ctx.topic}」→${ctx.debateQuestion}`,
    topic: ctx.debateQuestion,
  };
  return rules[ctx.mode];
}

export function passesMinimumQuality(
  ctx: TopicContext,
  personaId: PersonaId,
  content: string,
): boolean {
  const text = content.trim();
  if (text.length < 12) return false;
  if (personaId !== "moderator" && !hasAnchor(ctx, text)) return false;
  if (
    (ctx.mode === "versus" || ctx.mode === "comparison") &&
    ctx.sideA &&
    ctx.sideB
  ) {
    if (personaId === "pro" && !text.includes(ctx.sideA)) return false;
    if (personaId === "con" && !text.includes(ctx.sideB)) return false;
  }
  return true;
}

function personaHint(
  personaId: PersonaId,
  hints: (typeof DOMAIN_HINTS)[TopicDomain],
  round: number,
): string {
  const pool =
    personaId === "pro"
      ? hints.pro
      : personaId === "con"
        ? hints.con
        : hints.neutral;
  return roundFocusAngle(personaId, pool, round);
}

function rebuttalRule(personaId: PersonaId, round: number): string {
  if (personaId === "neutral") {
    return "중립:한쪽편금지.나는OO편금지.양쪽이름병렬.위키인용금지.";
  }
  if (round <= 1) return "";
  return "상대방금인용후반박필수.";
}

function exampleLine(ctx: TopicContext): string {
  if (ctx.sideA && ctx.sideB) {
    const hint =
      ctx.domain === "food"
        ? "상황·입맛"
        : ctx.domain === "tech"
          ? "쓸 때 체감"
          : ctx.domain === "social"
            ? "현실 조건"
            : "숨은 변수";
    return `예:나는 ${ctx.sideA} 쪽인데 ${hint} 보면 지금 비교에선 설득력 있음.`;
  }
  const openers: Partial<Record<TopicDomain, string>> = {
    food: "예:나는 찬성인데 혼밥·야식 상황에선 이게 더 낫다고 봄.",
    tech: "예:나는 찬성인데 생산성 체감이 더 크다고 봄.",
    social: "예:나는 찬성인데 일상에서 바로 이득이 있다고 봄.",
    science: "예:나는 다세계 해석 기준으론 논리적으로 열릴 수 있다고 봄.",
  };
  return openers[ctx.domain] ?? "예:나는 이쪽인데 숨은 변수 하나 짚고 말할게.";
}

export function buildDebatePrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources?: DebateSources | null,
): string {
  const stance = getPersonaStance(personaId, ctx);
  const hints = DOMAIN_HINTS[ctx.domain];
  const lastOpp = history
    .slice()
    .reverse()
    .find(
      (m) =>
        (personaId === "pro" && m.personaId === "con") ||
        (personaId === "con" && m.personaId === "pro"),
    );

  const oppLine = lastOpp
    ? `상대방금:${truncateSnippet(lastOpp.content, 80)}`
    : "";

  const factLine =
    sources && personaId !== "moderator"
      ? factCueForPrompt(sources, ctx, personaId, history, round)
      : null;

  return [
    `주제:${ctx.topic}`,
    `역할:${stance}`,
    `R${round}`,
    modeRules(ctx),
    `이번각도:${personaHint(personaId, hints, round)}`,
    `신선렌즈:${pickNovelLens(ctx.domain, round, personaId)}`,
    factLine ? `팩트참고:${factLine}(출처말하지말것)` : null,
    `직전:${compactHistory(history)}`,
    `이미씀금지:${bannedPhraseReminder(history)}`,
    oppLine,
    rebuttalRule(personaId, round),
    DEBATE_STYLE,
    FRESHNESS_RULE,
    `금지:${DEBATE_BAD_EXAMPLES}`,
    exampleLine(ctx),
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
  const order: PersonaId[] = ["pro", "con", "neutral"];
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
