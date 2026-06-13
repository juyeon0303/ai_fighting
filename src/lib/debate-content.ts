import type { DebateMessage, PersonaId } from "./types";
import type { DebateMode, TopicContext, TopicDomain } from "./topic-context";
import { getPersonaStance } from "./topic-context";
import { getPersona } from "./personas";
import { DEBATE_STYLE, DEBATE_BAD_EXAMPLES } from "./debate-style";

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

const PERSONA_GOOD_EXAMPLE: Record<PersonaId, string> = {
  moderator:
    "이번 주제는 양자 불멸이다. 다중세계 해석을 전제로 할지부터 정리하고, 각자 근거를 말해 달라.",
  pro: "양자 불멸은 이론적으로 설명 가능하다고 본다. 다중세계 해석에서는 관측자가 죽지 않는 분기가 남는다.",
  con: "양자 불멸은 현실 적용이 어렵다. 데코히어런스 때문에 거시 세계에서는 중첩 상태가 유지되지 않는다.",
  neutral:
    "찬성은 다중세계 해석, 반대는 데코히어런스를 중심에 둔다. '가능'의 정의를 먼저 맞춰야 한다.",
};

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

  if (content.length < 15) issues.push("too_short");

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
    versus: `대결 토론. 찬성=${ctx.sideA} 편 ONLY, 반대=${ctx.sideB} 편 ONLY. ${ctx.sideA}와 ${ctx.sideB} 이름을 반드시 언급.`,
    comparison: `비교 토론. 찬성=${ctx.sideA} 우위, 반대=${ctx.sideB} 우위. 두 대상 이름 필수.`,
    proposition: `찬반 토론. 주제 문장에 직접 답하세요: ${ctx.debateQuestion}`,
    choice: `선택 토론. 서로 다른 후보/답을 들고 ${ctx.topic}에 답하세요.`,
    wh_question: `질문 토론. ${ctx.debateQuestion}에 대해 서로 다른 설명/입장.`,
    casual: `짧은 입력 「${ctx.topic}」→ 실제 토론 주제: ${ctx.debateQuestion}`,
    topic: `주제 토론. ${ctx.debateQuestion}`,
  };
  return rules[ctx.mode];
}

export function buildDebatePrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string {
  const persona = getPersona(personaId);
  const stance = getPersonaStance(personaId, ctx);
  const hints = DOMAIN_HINTS[ctx.domain];

  const historyText = history
    .slice(-8)
    .map((m) => `[${getPersona(m.personaId).name}] ${m.content}`)
    .join("\n");

  return `당신은 한국어 토론 AI "${persona.name}"입니다. 무난하고 자연스럽게, 근거 중심으로 말한다.

【원본 주제】${ctx.topic}
【토론 형식】${ctx.brief}
【실제 쟁점】${ctx.debateQuestion}
【분야】${ctx.domain}
【역할】${stance}
【라운드】${round}

논거 방향 (이 단어를 그대로 나열하지 말고, 주제에 맞는 구체적 사실로 풀어써):
- 긍정 쪽이 쓸 만한 각도: ${hints.pro.join(" / ")}
- 비판 쪽이 쓸 만한 각도: ${hints.con.join(" / ")}

이전 발언:
${historyText || "(없음)"}

${DEBATE_STYLE}

절대 이렇게 쓰지 마:
${DEBATE_BAD_EXAMPLES}

이렇게 써 (톤·구체성 참고, 내용은 주제에 맞게):
${PERSONA_GOOD_EXAMPLE[personaId]}

규칙:
- ${modeRules(ctx)}
- 주제와 무관한 정책·경제 일반론 금지
- 2~4문장, 짧고 세게
- 상대 말 직접 반박 (사회자는 쟁점 짚고 진행)
- 순수 텍스트만`;
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
