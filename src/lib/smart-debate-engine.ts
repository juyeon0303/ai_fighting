import type { DebateMessage, PersonaId } from "./types";
import type { DebateMode, TopicContext, TopicDomain } from "./topic-context";
import { validateResponse } from "./debate-content";
import { acceptDebateTurn } from "./debate-quality";
import type { DebateSources } from "./debate-sources";
import { getDebateSources, speechFactLine } from "./debate-sources";
import { pickNovelLens } from "./debate-novelty";
import {
  hashSeed,
  pickFreshWikiFact,
  pickSeeded,
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
      "매콤달콤한 게 확실히 더 땡김",
      "한국 입맛엔 이쪽이 더 맞음",
      "야식·혼밥 때 만족감이 큼",
      "가격 대비 배부름이 나음",
    ],
    con: [
      "금방 질리거나 부담이 옴",
      "같이 나눠 먹기엔 다른 쪽이 편함",
      "맛 편차가 커서 실패하면 바로 흥 깨짐",
      "배달·메뉴 고를 때 이쪽이 더 무난함",
    ],
    neutral: [
      "그냥 취향 싸움에 가까움",
      "혼밥이냐 회식이냐에 따라 답이 바뀜",
      "맛집·브랜드 따라 체감이 너무 달라짐",
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


function topicLabel(ctx: TopicContext): string {
  return ctx.displayTopic || ctx.topic;
}

function extractQuote(text: string, seed: number): string | null {
  const words = text.match(/[가-힣A-Za-z0-9]{3,14}/g) ?? [];
  if (words.length === 0) return null;
  return pickSeeded(words, seed);
}

function wikiSnippet(fact: string, maxLen = 32): string {
  const cleaned = fact.replace(/\.$/, "").trim();
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen);
  const lastBreak = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf(","));
  if (lastBreak > 12) return cut.slice(0, lastBreak);
  return `${cut}…`;
}

function wikiRelatesToSides(wiki: WikiContext, ctx: TopicContext): boolean {
  const sides = [ctx.sideA, ctx.sideB].filter(Boolean) as string[];
  const blob = `${wiki.title} ${wiki.extract}`;
  return sides.some((s) => blob.includes(s));
}

/** 사회자만, 짧게. '위키'·긴 인용 금지 */
function moderatorWikiFlavor(
  sources: DebateSources,
  ctx: TopicContext,
  history: DebateMessage[],
  seed: number,
): string | null {
  const wiki =
    sources.primary ??
    sources.sideA ??
    sources.sideB;
  if (!wiki || !wikiRelatesToSides(wiki, ctx)) return null;

  const fact = pickFreshWikiFact(wiki, history, seed);
  if (!fact) return null;
  const snippet = wikiSnippet(fact);
  if (snippet.length < 8) return null;

  return pickSeeded(
    [
      `${wiki.title} 보면 ${snippet} 정도로 알려져 있음. 이 정도만 참고하고 가자.`,
      `${snippet} 같은 설명도 있는데, 논점이랑 맞는지 따져 보자.`,
    ],
    seed,
  );
}

function freshnessFlavor(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  seed: number,
): string | null {
  if (personaId === "moderator") return null;

  const factLine =
    speechFactLine(sources, ctx, personaId, history, round, seed) ?? null;
  if (factLine) return factLine;

  const lens = pickNovelLens(ctx.domain, round, personaId);
  return pickSeeded(
    [
      `뻔한 말 말고 ${lens} 쪽으로 보면 답이 갈림.`,
      `${lens} 변수가 지금 쟁점임.`,
    ],
    seed,
  );
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

function composeVersus(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: DebateSources,
  debateId: string,
  salt: number,
): string {
  const a = ctx.sideA!;
  const b = ctx.sideB!;
  const h = DOMAIN_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;
  const opp = lastOpponentMessage(personaId, history);
  const fresh = freshnessFlavor(sources, ctx, personaId, history, round, seed);

  if (personaId === "moderator") {
    if (round === 1) {
      const openers = [
        `${a}랑 ${b}, 뭐가 나은지 각자 근거 들고 와.`,
        `${a} vs ${b} — 쟁점은 ${pickSeeded(h.pro, seed)} vs ${pickSeeded(h.con, seed)} 정도로 보면 됨.`,
        moderatorWikiFlavor(sources, ctx, history, seed),
      ].filter(Boolean) as string[];
      return pickSeeded(openers, seed);
    }

    const lines = [
      `지금까지 말 보면 기준이 갈리는데, ${pickSeeded(h.neutral, seed)} 쪽으로 정리해 보자.`,
      `상대 말 한 줄 짚고 반박해 봐.`,
      moderatorWikiFlavor(sources, ctx, history, seed),
      `${a} vs ${b} — 쟁점은 ${pickSeeded(h.pro, seed)} vs ${pickSeeded(h.con, seed)} 정도로 보면 됨.`,
    ].filter(Boolean) as string[];
    return pickSeeded(lines, seed);
  }

  if (personaId === "pro") {
    const openers = [
      `나는 ${a} 쪽인데,`,
      `${a}가 낫다고 봄.`,
      `개인적으로 ${a}가`,
    ];
    const parts = [
      `${pickSeeded(openers, seed)} ${pickSeeded(h.pro, i)}.`,
      fresh,
    ].filter(Boolean) as string[];
    if (opp && round > 1) {
      const q = extractQuote(opp.content, seed);
      if (q) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed)
            .replace("{quote}", q)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed)),
        );
      }
    } else {
      parts.push(`${b}도 나쁘진 않은데 지금 비교에선 ${a}가 더 설득력 있음.`);
    }
    return parts.join(" ");
  }

  if (personaId === "con") {
    const openers = [
      `나는 ${b} 쪽인데,`,
      `${b}가 낫다고 봄.`,
      `차라리 ${b}가`,
    ];
    const parts = [
      `${pickSeeded(openers, seed)} ${pickSeeded(h.con, i)}.`,
      fresh,
    ].filter(Boolean) as string[];
    if (opp && round > 1) {
      const q = extractQuote(opp.content, seed + 1);
      if (q) {
        parts.push(
          pickSeeded(QUOTE_REBUTTAL, seed + 2)
            .replace("{quote}", q)
            .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 3)),
        );
      }
    } else {
      parts.push(`${a} 말도 일리 있는데 실전에서 고르면 ${b} 쪽이 더 낫다.`);
    }
    return parts.join(" ");
  }

  const neutralLines = [
    `${a}는 ${pickSeeded(h.pro, i)} 느낌이고, ${b}는 ${pickSeeded(h.con, i)} 쪽이라 기준만 다르면 답이 갈림.`,
    `한쪽으로 못 박기 어렵다. ${pickSeeded(h.neutral, i)}.`,
    fresh,
  ].filter(Boolean) as string[];
  return pickSeeded(neutralLines, seed);
}

function composeChoice(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: DebateSources,
  debateId: string,
  salt: number,
): string {
  const t = ctx.topic;
  const h = DOMAIN_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;
  const fresh = freshnessFlavor(sources, ctx, personaId, history, round, seed);

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
    const lines = [
      `「${t}」 각자 답 골라서 근거 말해 봐.`,
      `후보가 갈리는 주제다. ${pickSeeded(h.neutral, seed)}.`,
      round === 1
        ? moderatorWikiFlavor(sources, ctx, history, seed)
        : `비교 기준부터 맞추고 가자.`,
    ].filter(Boolean) as string[];
    return pickSeeded(lines, seed);
  }

  if (personaId === "pro") {
    const parts = [
      `나는 ${proPick} 쪽인데, ${pickSeeded(h.pro, i)}.`,
      fresh,
    ].filter(Boolean) as string[];
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
    return parts.join(" ");
  }

  if (personaId === "con") {
    const parts = [
      `차라리 ${conPick}이 낫다고 봄. ${pickSeeded(h.con, i)}.`,
      fresh,
    ].filter(Boolean) as string[];
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
    return parts.join(" ");
  }

  return [
    `「${t}」 정답 하나로 못 박기 어렵다. ${pickSeeded(h.neutral, i)}.`,
    `${proPick}이랑 ${conPick} 둘 다 일리 있음.`,
    fresh,
  ]
    .filter(Boolean)
    .join(" ");
}

function composeDual(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: DebateSources,
  debateId: string,
  salt: number,
): string {
  const q = ctx.debateQuestion;
  const label = topicLabel(ctx);
  const h = DOMAIN_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;
  const opp = lastOpponentMessage(personaId, history);
  const fresh = freshnessFlavor(sources, ctx, personaId, history, round, seed);

  if (personaId === "moderator") {
    const lines = [
      `「${label}」 토론 시작. 쟁점은 ${q}.`,
      `${pickSeeded(h.neutral, seed)} 쪽으로 말해 봐.`,
      round === 1
        ? moderatorWikiFlavor(sources, ctx, history, seed)
        : `상대 말 짚고 반박해 봐.`,
    ].filter(Boolean) as string[];
    return pickSeeded(lines, seed);
  }

  if (personaId === "pro") {
    const parts = [
      `${q} — 찬성 쪽임. ${pickSeeded(h.pro, i)}.`,
      fresh,
    ].filter(Boolean) as string[];
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
    return parts.join(" ");
  }

  if (personaId === "con") {
    const parts = [
      `${q} — 반대 쪽임. ${pickSeeded(h.con, i)}.`,
      fresh,
    ].filter(Boolean) as string[];
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
    return parts.join(" ");
  }

  return [
    `${q} — 한쪽으로 못 박기 어렵다.`,
    `찬성은 ${pickSeeded(h.pro, i)} 쪽, 반대는 ${pickSeeded(h.con, i)} 쪽.`,
    pickSeeded(h.neutral, seed),
    fresh,
  ]
    .filter(Boolean)
    .join(" ");
}

function composeCasual(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: DebateSources,
  debateId: string,
  salt: number,
): string {
  const q = ctx.debateQuestion;
  const seed = seedFor(debateId, round, personaId, salt);
  const fresh = freshnessFlavor(sources, ctx, personaId, history, round, seed);

  if (personaId === "moderator") {
    const lines = [
      `입력이 「${ctx.topic}」로 짧다. 토론은 ${q}로 가져가자.`,
      `짧아도 쟁점은 있음. 근거 말해 봐.`,
      round === 1
        ? moderatorWikiFlavor(sources, ctx, history, seed)
        : `「${ctx.topic}」를 어떻게 보느냐가 핵심임.`,
    ].filter(Boolean) as string[];
    return pickSeeded(lines, seed);
  }

  if (personaId === "pro") {
    return [
      `「${ctx.topic}」도 의미 있음.`,
      `${q} — 긍정적으로 봄.`,
      fresh ?? `짧아도 관계 여는 신호가 될 수 있음.`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (personaId === "con") {
    return [
      `「${ctx.topic}」만으론 대화가 잘 안 이어짐.`,
      `${q} — 부정적으로 봄.`,
      fresh ?? `형식적 반복에 가까움.`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${q} — 상황마다 다름.`,
    `친밀도랑 맥락에 따라 평가가 갈림.`,
    fresh,
  ]
    .filter(Boolean)
    .join(" ");
}

function composeByMode(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: DebateSources,
  debateId: string,
  salt: number,
): string {
  const mode: DebateMode = ctx.mode;

  if (mode === "versus" || mode === "comparison") {
    return composeVersus(ctx, personaId, history, round, sources, debateId, salt);
  }
  if (mode === "choice") {
    return composeChoice(ctx, personaId, history, round, sources, debateId, salt);
  }
  if (mode === "casual") {
    return composeCasual(ctx, personaId, history, round, sources, debateId, salt);
  }
  return composeDual(ctx, personaId, history, round, sources, debateId, salt);
}

const EMPTY_SOURCES: DebateSources = {
  primary: null,
  sideA: null,
  sideB: null,
};

export async function generateSmartTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  debateId: string,
): Promise<string> {
  const sources = await getDebateSources(ctx);

  for (let attempt = 0; attempt < 6; attempt++) {
    const content = composeByMode(
      ctx,
      personaId,
      history,
      round,
      sources,
      debateId,
      attempt,
    );

    if (
      validateResponse(ctx, personaId, content).ok &&
      acceptDebateTurn(history, personaId, content, ctx)
    ) {
      return content;
    }
  }

  const fallback = composeByMode(
    ctx,
    personaId,
    history,
    round,
    EMPTY_SOURCES,
    debateId,
    99,
  );
  return fallback;
}
