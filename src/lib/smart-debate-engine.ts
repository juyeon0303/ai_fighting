import type { DebateMessage, PersonaId } from "./types";
import type { DebateMode, TopicContext, TopicDomain } from "./topic-context";
import { validateResponse } from "./debate-content";
import {
  getWikiContext,
  hashSeed,
  pickSeeded,
  pickWikiFact,
  type WikiContext,
} from "./wiki-context";

const PERSONA_SALT: Record<PersonaId, number> = {
  moderator: 0,
  pro: 11,
  con: 23,
  neutral: 37,
};

const DOMAIN_ANGLES: Record<
  TopicDomain,
  { pro: string[]; con: string[]; neutral: string[] }
> = {
  esports: {
    pro: [
      "월드·국제대회 성적이 더 압도적임",
      "라인전·한타 기여가 팀 승률에 직결됨",
      "메타 변화에 적응한 플레이가 더 안정적임",
    ],
    con: [
      "최근 시즌 폼이 오히려 밀림",
      "팀플·시야·오브젝트 운영에서 구멍이 보임",
      "하이라이트만 좋고 전체 경기 흐름은 불리함",
    ],
    neutral: [
      "시즌·패치·팀 환경에 따라 우위가 바뀜",
      "포지션·역할이 달라서 단순 비교가 어려움",
      "비교 기준(개인 vs 팀 기여)부터 정해야 함",
    ],
  },
  food: {
    pro: [
      "맛 깊이·만족감이 확실히 더 큼",
      "가격 대비 양·품질 밸런스가 좋음",
      "조합·메뉴 다양성이 훨씬 낫음",
    ],
    con: [
      "질리거나 건강 부담이 빨리 온다",
      "가격·대기시간 대비 체감 가치가 떨어진다",
      "맛 편차가 커서 일관된 평가가 어렵다",
    ],
    neutral: [
      "취향·기분·상황에 따라 답이 갈린다",
      "점심/야식/회식 등 맥락별로 최적이 다르다",
      "지역·브랜드 편차가 커서 한쪽으로 단정하기 어렵다",
    ],
  },
  tech: {
    pro: [
      "생산성·개발 속도가 체감상 더 빠름",
      "생태계·문서·커뮤니티가 더 성숙함",
      "장기 유지보수 비용이 더 낮음",
    ],
    con: [
      "러닝커브·초기 세팅 비용이 부담됨",
      "레거시·의존성 리스크가 큼",
      "팀 규모에 안 맞아 오히려 복잡도만 늘어남",
    ],
    neutral: [
      "팀 규모·프로젝트 성격에 따라 정답이 바뀜",
      "단기 속도 vs 장기 안정성 트레이드오프임",
      "이미 쓰는 스택·인력 풀에 답이 갈림",
    ],
  },
  entertainment: {
    pro: [
      "완성도·대중성이 확실히 더 높음",
      "문화적 영향력·확장성이 큼",
      "다시 보거나 소비할 때 만족감이 큼",
    ],
    con: [
      "상업성 과잉으로 피로감이 옴",
      "깊이·독창성은 기대보다 약함",
      "유행 타고 지나가면 가치가 급락함",
    ],
    neutral: [
      "세대·취향·감상 맥락에 따라 평가가 갈림",
      "대중성과 예술성 중 뭘 기준으로 볼지가 핵심",
      "시간이 지나야 진짜 위치가 정해지는 장르임",
    ],
  },
  social: {
    pro: [
      "삶의 질·관계·효율이 실제로 올라감",
      "현실에서 바로 체감되는 이점이 있음",
      "사회 전체 비용 대비 이득이 큼",
    ],
    con: [
      "부작용·불평등·스트레스가 같이 따라옴",
      "이상론만 있고 현장 적용은 어려움",
      "단기 이득이 장기 리스크를 키울 수 있음",
    ],
    neutral: [
      "개인·환경·제도에 따라 결과가 완전히 다름",
      "전면 도입 vs 제한적 도입부터 갈림",
      "성급한 결론보다 조건을 먼저 정하는 게 맞음",
    ],
  },
  science: {
    pro: [
      "실험·관측 데이터가 이쪽을 지지함",
      "수식·모델 예측이 실제와 잘 맞음",
      "반복 검증에서 계속 살아남는 설명임",
    ],
    con: [
      "반례 실험이나 관측 한계가 명확함",
      "이론 전제 자체가 아직 허약함",
      "아직 재현·증명이 안 돼서 성급함",
    ],
    neutral: [
      "용어 정의·가능/불가능 기준이 애초에 다름",
      "증거 수준이 아직 결론 내리기엔 부족함",
      "가설 범위를 좁혀야 논쟁이 의미 있음",
    ],
  },
  general: {
    pro: [
      "경험상 체감 이점이 분명함",
      "실용적·현실적 근거가 더 설득력 있음",
      "긍정 해석이 더 합리적으로 보임",
    ],
    con: [
      "한계·부작용·대안이 더 설득력 있음",
      "긍정 프레임이 현실을 과소평가함",
      "지금 근거로는 비판이 더 타당함",
    ],
    neutral: [
      "맥락·조건에 따라 찬반이 바뀐다",
      "비교 기준을 먼저 정하는 것이 필요하다",
      "현재 정보만으로는 성급한 결론은 위험하다",
    ],
  },
};

const REBUTTAL_REFUTES = [
  "예외 사례로 보이고 일반화하기 어렵다",
  "핵심 변수가 빠져 있다",
  "인과 관계가 뒤바뀐 것 같다",
  "그 조건에서는 맞지만 현실 적용이 어렵다",
  "사례 하나로 전체를 대표하기 어렵다",
];

const QUOTE_REBUTTAL = [
  "앞서 '{quote}'라는 지적이 있었는데, {refute}",
  "상대가 말한 '{quote}' 부분은 {refute}",
  "'{quote}'는 일리가 있지만 {refute}",
];

function seedFor(
  debateId: string,
  round: number,
  personaId: PersonaId,
  salt = 0,
): number {
  return (
    hashSeed(debateId) +
    round * 97 +
    PERSONA_SALT[personaId] +
    salt
  );
}

function primaryAnchor(ctx: TopicContext): string {
  return (
    ctx.sideA ??
    ctx.displayTopic ??
    ctx.topic
  ).slice(0, 40);
}

function topicLabel(ctx: TopicContext): string {
  return ctx.displayTopic || ctx.topic;
}

function extractQuote(text: string, seed: number): string | null {
  const words = text.match(/[가-힣A-Za-z0-9]{3,14}/g) ?? [];
  if (words.length === 0) return null;
  return pickSeeded(words, seed);
}

function lastOpponentMessage(
  personaId: PersonaId,
  history: DebateMessage[],
): DebateMessage | undefined {
  const target =
    personaId === "pro" ? "con" : personaId === "con" ? "pro" : null;
  if (!target) return undefined;

  return history
    .slice()
    .reverse()
    .find((m) => m.personaId === target);
}

function wikiLine(
  personaId: PersonaId,
  wiki: WikiContext,
  ctx: TopicContext,
  seed: number,
): string | null {
  const fact = pickWikiFact(wiki, seed);
  const anchor = primaryAnchor(ctx);

  const templates: Record<PersonaId, string[]> = {
    moderator: [
      `참고로 위키 「${wiki.title}」에는 ${fact}라고 설명한다. 이 내용과 논점을 연결해 보자.`,
    ],
    pro: [
      `참고 자료에 따르면 ${fact} — ${anchor}에 대한 찬성 논리와 맞닿아 있다.`,
      `「${wiki.title}」 설명 중 ${fact}는 찬성 입장을 뒷받침한다.`,
    ],
    con: [
      `위키에 ${fact}가 나오긴 하지만, ${anchor}에 그대로 적용하기는 어렵다.`,
      `「${wiki.title}」의 ${fact}는 오히려 반대 입장에 가깝다.`,
    ],
    neutral: [
      `위키 기준으로는 ${fact} — 다만 ${anchor}와 바로 연결하긴 어렵다.`,
    ],
  };

  return pickSeeded(templates[personaId], seed);
}

function composeVersus(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  wiki: WikiContext | null,
  debateId: string,
  salt: number,
): string {
  const a = ctx.sideA!;
  const b = ctx.sideB!;
  const h = DOMAIN_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;
  const opp = lastOpponentMessage(personaId, history);

  if (personaId === "moderator") {
    const lines = [
      `${a}와 ${b}를 비교한다. 찬성은 ${a}, 반대는 ${b} 입장이다. ${pickSeeded(h.neutral, seed)} 기준으로 근거를 말해 달라.`,
      `지금까지 논의를 보면 ${a}와 ${b}의 차이가 드러난다. 상대 주장을 인용해 반박해 달라.`,
      wiki
        ? wikiLine("moderator", wiki, ctx, seed)!
        : `쟁점은 ${pickSeeded(h.pro, seed)}와 ${pickSeeded(h.con, seed)}의 차이다. 이 범위 안에서 답해 달라.`,
    ];
    return pickSeeded(lines, seed);
  }

  if (personaId === "pro") {
    const parts = [
      `찬성 입장에서는 ${a}가 더 낫다. ${pickSeeded(h.pro, i)} — ${b}와의 비교 기준이 애매하다.`,
    ];
    if (opp && round > 1) {
      const q = extractQuote(opp.content, seed);
      if (q) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed)
            .replace("{quote}", q)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed)),
        );
      }
    }
    if (wiki && (seed % 3 !== 0)) parts.push(wikiLine("pro", wiki, ctx, seed)!);
    return parts.join(" ");
  }

  if (personaId === "con") {
    const parts = [
      `반대 입장에서는 ${b}가 더 낫다. ${pickSeeded(h.con, i)} — ${a} 쪽 논리에는 한계가 있다.`,
    ];
    if (opp && round > 1) {
      const q = extractQuote(opp.content, seed + 1);
      if (q) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed + 2)
            .replace("{quote}", q)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 3)),
        );
      }
    }
    if (wiki && (seed % 3 !== 1)) parts.push(wikiLine("con", wiki, ctx, seed)!);
    return parts.join(" ");
  }

  return `${a}는 ${pickSeeded(h.pro, i)}에서 강점이 있고, ${b}는 ${pickSeeded(h.con, i)}에서 강점이 있다. ${pickSeeded(h.neutral, seed)}.`;
}

function composeChoice(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  wiki: WikiContext | null,
  debateId: string,
  salt: number,
): string {
  const t = ctx.topic;
  const h = DOMAIN_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;

  const proPick = pickSeeded(
    [ctx.anchors[1] ?? "첫 번째 후보", "우선 후보", "상위 선택지", "A안"],
    seed,
  );
  const conPick = pickSeeded(
    [ctx.anchors[2] ?? "다른 후보", "대안 후보", "반대 선택지", "B안"],
    seed + 5,
  );
  const opp = lastOpponentMessage(personaId, history);

  if (personaId === "moderator") {
    return pickSeeded(
      [
        `「${t}」에 대해 각자 선택과 근거를 말해 달라.`,
        `후보가 갈리는 주제다. ${pickSeeded(h.neutral, seed)} 기준으로 비교해 달라.`,
        wiki
          ? wikiLine("moderator", wiki, ctx, seed)!
          : `「${t}」의 결론을 내리려면 비교 기준을 먼저 정해야 한다.`,
      ],
      seed,
    );
  }

  if (personaId === "pro") {
    const parts = [
      `「${t}」에 대한 내 답은 ${proPick}이다. ${pickSeeded(h.pro, i)} 기준에서 타당하다.`,
    ];
    if (opp && round > 1) {
      const q = extractQuote(opp.content, seed);
      if (q) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed)
            .replace("{quote}", q)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 1)),
        );
      }
    }
    if (wiki) parts.push(wikiLine("pro", wiki, ctx, seed)!);
    return parts.join(" ");
  }

  if (personaId === "con") {
    const parts = [
      `「${t}」에는 ${conPick}이 더 적합하다. ${pickSeeded(h.con, i)} 근거가 있다.`,
    ];
    if (opp && round > 1) {
      const q = extractQuote(opp.content, seed);
      if (q) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed)
            .replace("{quote}", q)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 2)),
        );
      }
    }
    if (wiki) parts.push(wikiLine("con", wiki, ctx, seed)!);
    return parts.join(" ");
  }

  return `「${t}」의 정답은 하나로 정하기 어렵다. ${pickSeeded(h.neutral, i)}에 따라 우선순위가 바뀐다. ${proPick}과 ${conPick} 모두 「${t}」에 대한 타당한 답이 될 수 있다.`;
}

function composeDual(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  wiki: WikiContext | null,
  debateId: string,
  salt: number,
): string {
  const q = ctx.debateQuestion;
  const label = topicLabel(ctx);
  const h = DOMAIN_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;
  const opp = lastOpponentMessage(personaId, history);

  if (personaId === "moderator") {
    return pickSeeded(
      [
        `「${label}」에 대한 토론을 시작한다. 쟁점은 ${q}이다.`,
        `주제를 벗어나지 말고 ${pickSeeded(h.neutral, seed)} 기준으로 말해 달라.`,
        wiki
          ? wikiLine("moderator", wiki, ctx, seed)!
          : `지금까지 논의를 보면 ${q}에서 논점이 정리됐다. 상대 주장을 인용해 반박해 달라.`,
      ],
      seed,
    );
  }

  if (personaId === "pro") {
    const parts = [
      `${q} — 찬성 입장이다. ${pickSeeded(h.pro, i)} 근거가 있다.`,
    ];
    if (opp) {
      const qSnippet = extractQuote(opp.content, seed);
      if (qSnippet) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed)
            .replace("{quote}", qSnippet)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 1)),
        );
      }
    }
    if (wiki && parts.length < 2) {
      parts.push(wikiLine("pro", wiki, ctx, seed)!);
    }
    return parts.join(" ");
  }

  if (personaId === "con") {
    const parts = [
      `${q} — 반대 입장이다. ${pickSeeded(h.con, i)}.`,
    ];
    if (opp) {
      const qSnippet = extractQuote(opp.content, seed);
      if (qSnippet) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed)
            .replace("{quote}", qSnippet)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 2)),
        );
      }
    }
    if (wiki && parts.length < 2) {
      parts.push(wikiLine("con", wiki, ctx, seed)!);
    }
    return parts.join(" ");
  }

  return `${q}에 대한 단일 정답은 없다. 찬성은 ${pickSeeded(h.pro, i)} 쪽, 반대는 ${pickSeeded(h.con, i)} 쪽이다. ${pickSeeded(h.neutral, seed)} 기준으로 판단하는 것이 맞다.`;
}

function composeCasual(
  ctx: TopicContext,
  personaId: PersonaId,
  round: number,
  wiki: WikiContext | null,
  debateId: string,
  salt: number,
): string {
  const q = ctx.debateQuestion;
  const seed = seedFor(debateId, round, personaId, salt);

  if (personaId === "moderator") {
    return pickSeeded(
      [
        `입력이 「${ctx.topic}」로 짧다. 토론 주제는 ${q}로 정리한다.`,
        `주제가 짧아도 쟁점은 있다. 구체적인 근거를 말해 달라.`,
        wiki
          ? wikiLine("moderator", wiki, ctx, seed)!
          : `이번 논의는 「${ctx.topic}」를 어떻게 해석하느냐의 문제다.`,
      ],
      seed,
    );
  }

  if (personaId === "pro") {
    return `「${ctx.topic}」에는 의미가 있다. ${q} — 긍정적으로 본다. 짧은 표현도 관계를 여는 신호가 될 수 있다.`;
  }
  if (personaId === "con") {
    return `「${ctx.topic}」만으로는 대화가 이어지기 어렵다. ${q} — 부정적으로 본다. 형식적 반복에 가깝다.`;
  }
  return `${q} — 상황에 따라 다르다. 관계의 친밀도와 맥락에 따라 평가가 달라진다.`;
}

function composeByMode(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  wiki: WikiContext | null,
  debateId: string,
  salt: number,
): string {
  const mode: DebateMode = ctx.mode;

  if (mode === "versus" || mode === "comparison") {
    return composeVersus(ctx, personaId, history, round, wiki, debateId, salt);
  }
  if (mode === "choice") {
    return composeChoice(ctx, personaId, history, round, wiki, debateId, salt);
  }
  if (mode === "casual") {
    return composeCasual(ctx, personaId, round, wiki, debateId, salt);
  }
  return composeDual(ctx, personaId, history, round, wiki, debateId, salt);
}

export async function generateSmartTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId: string,
): Promise<string> {
  const wiki = await getWikiContext(ctx.topic);

  for (let attempt = 0; attempt < 6; attempt++) {
    const content = composeByMode(
      ctx,
      personaId,
      history,
      round,
      wiki,
      debateId,
      attempt,
    );

    if (validateResponse(ctx, personaId, content).ok) {
      return content;
    }
  }

  const fallback = composeByMode(
    ctx,
    personaId,
    history,
    round,
    null,
    debateId,
    99,
  );
  return fallback;
}
