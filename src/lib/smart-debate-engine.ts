import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext, TopicDomain } from "./topic-context";
import { geniusLens } from "./personas";
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
  atlas: 11,
  cipher: 23,
  ember: 37,
};

const GENIUS_OPENERS: Record<PersonaId, string[]> = {
  atlas: ["큰 그림만 보면", "원리부터 따지면", "한 단계 위에서 보면"],
  cipher: ["논리만 따지면", "정의부터 잡으면", "반례를 보면"],
  ember: ["비유하자면", "체감으로 말하면", "실험해 보면"],
};

const GENIUS_ANGLES: Record<
  TopicDomain,
  Record<PersonaId, string[]>
> = {
  esports: {
    atlas: [
      "월드·국제대회 성적이 핵심 변수임",
      "라인전·한타 기여가 팀 승률에 직결됨",
      "메타 변화 적응이 장기 우위를 만듦",
    ],
    cipher: [
      "최근 시즌 폼이 오히려 밀림",
      "팀플·시야 운영에서 구멍이 보임",
      "하이라이트만 좋고 전체 흐름은 불리함",
    ],
    ember: [
      "시즌·패치·팀 환경에 따라 우위가 바뀜",
      "포지션·역할이 달라서 단순 비교가 어려움",
      "비교 기준부터 정해야 말이 됨",
    ],
  },
  food: {
    atlas: [
      "맛의 깊이·만족감이 장기적으로 중요함",
      "가격 대비 배부름이 체감에 크게 작용함",
      "식사 경험 전체가 평가를 좌우함",
    ],
    cipher: [
      "금방 질리거나 건강 부담이 옴",
      "브랜드·메뉴 편차가 커서 일관성이 떨어짐",
      "상황에 따라 만족도가 크게 갈림",
    ],
    ember: [
      "그냥 취향 싸움에 가까움",
      "혼밥이냐 회식이냐에 따라 답이 바뀜",
      "입맛·브랜드 따라 체감이 너무 달라짐",
    ],
  },
  tech: {
    atlas: [
      "생산성·개발 속도가 체감상 더 빠름",
      "생태계·문서가 성숙해서 장기 이득이 큼",
      "유지보수 비용이 더 낮게 보임",
    ],
    cipher: [
      "러닝커브·초기 세팅 비용이 부담됨",
      "레거시·의존성 리스크가 큼",
      "팀 규모에 안 맞으면 복잡도만 늘어남",
    ],
    ember: [
      "팀 규모·프로젝트 성격에 따라 정답이 바뀜",
      "단기 속도 vs 장기 안정성 트레이드오프임",
      "이미 쓰는 스택·인력에 답이 갈림",
    ],
  },
  entertainment: {
    atlas: [
      "완성도·대중성이 확실히 높음",
      "문화적 영향력·확장성이 큼",
      "다시 소비할 때 만족감이 큼",
    ],
    cipher: [
      "상업성 과잉으로 피로감이 옴",
      "깊이·독창성은 기대보다 약함",
      "유행 타면 가치가 급락할 수 있음",
    ],
    ember: [
      "세대·취향·맥락에 따라 평가가 갈림",
      "대중성과 예술성 중 뭘 볼지가 핵심",
      "시간 지나야 진짜 위치가 정해짐",
    ],
  },
  social: {
    atlas: [
      "삶의 질·효율이 실제로 올라감",
      "현실에서 바로 체감되는 이점이 있음",
      "사회 전체 비용 대비 이득이 큼",
    ],
    cipher: [
      "부작용·불평등·스트레스가 따라옴",
      "이상론만 있고 현장 적용은 어려움",
      "단기 이득이 장기 리스크를 키울 수 있음",
    ],
    ember: [
      "개인·환경·제도에 따라 결과가 완전히 다름",
      "전면 도입 vs 제한적 도입부터 갈림",
      "성급한 결론보다 조건을 먼저 정하는 게 맞음",
    ],
  },
  science: {
    atlas: [
      "실험·관측 데이터가 이쪽을 지지함",
      "수식·모델 예측이 실제와 잘 맞음",
      "반복 검증에서 계속 살아남는 설명임",
    ],
    cipher: [
      "반례 실험이나 관측 한계가 명확함",
      "이론 전제 자체가 아직 허약함",
      "아직 재현·증명이 안 돼서 성급함",
    ],
    ember: [
      "용어 정의·가능/불가능 기준이 애초에 다름",
      "증거 수준이 결론 내리기엔 부족함",
      "가설 범위를 좁혀야 논쟁이 의미 있음",
    ],
  },
  general: {
    atlas: [
      "경험상 체감 이점이 분명함",
      "실용적·현실적 근거가 더 설득력 있음",
      "큰 흐름상 이 해석이 맞아 보임",
    ],
    cipher: [
      "한계·부작용·대안이 더 설득력 있음",
      "지금 근거로는 비판이 더 타당함",
      "숨은 전제가 깨지면 결론이 바뀜",
    ],
    ember: [
      "맥락·조건에 따라 답이 바뀐다",
      "비교 기준을 먼저 정해야 한다",
      "현재 정보만으로는 성급한 결론은 위험하다",
    ],
  },
};

const REBUTTAL_REFUTES = [
  "예외 사례로 보이고 일반화하기 어렵다",
  "핵심 변수가 빠져 있다",
  "인과 관계가 뒤바뀐 것 같다",
  "그 조건에서는 맞지만 현실 적용이 어렵다",
];

const QUOTE_REBUTTAL = [
  "앞서 '{quote}'라는 말이 있었는데, {refute}",
  "방금 '{quote}' 부분은 {refute}",
  "'{quote}' 그건 인정하는데 {refute}",
];

function seedFor(
  debateId: string,
  round: number,
  personaId: PersonaId,
  salt = 0,
): number {
  return hashSeed(debateId) + round * 97 + PERSONA_SALT[personaId] + salt;
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

function wikiRelatesToTopic(wiki: WikiContext, ctx: TopicContext): boolean {
  const blob = `${wiki.title} ${wiki.extract}`;
  const topicBlob = `${ctx.topic} ${ctx.debateQuestion}`;
  if (ctx.sideA && blob.includes(ctx.sideA)) return true;
  if (ctx.sideB && blob.includes(ctx.sideB)) return true;
  return topicBlob.split(/\s+/).some((w) => w.length >= 2 && blob.includes(w));
}

function wikiFlavor(
  sources: DebateSources,
  ctx: TopicContext,
  history: DebateMessage[],
  seed: number,
): string | null {
  const wiki = sources.primary ?? sources.sideA ?? sources.sideB;
  if (!wiki || !wikiRelatesToTopic(wiki, ctx)) return null;

  const fact = pickFreshWikiFact(wiki, history, seed);
  if (!fact) return null;
  const snippet = wikiSnippet(fact);
  if (snippet.length < 8) return null;

  return pickSeeded(
    [
      `${wiki.title} 보면 ${snippet} 정도로 알려져 있음.`,
      `${snippet} 같은 설명도 있는데 맥락이 맞는지 따져 보자.`,
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
  const factLine =
    speechFactLine(sources, ctx, personaId, history, round, seed) ?? null;
  if (factLine) return factLine;

  const lens = pickNovelLens(ctx.domain, round, personaId);
  return pickSeeded(
    [`${lens} 변수가 지금 포인트임.`, `${lens} 보면 답이 갈림.`],
    seed,
  );
}

function lastPeerMessage(
  personaId: PersonaId,
  history: DebateMessage[],
): DebateMessage | undefined {
  return history
    .slice()
    .reverse()
    .find((m) => m.personaId !== personaId);
}

function composeGeniusTurn(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  sources: DebateSources,
  debateId: string,
  salt: number,
): string {
  const label = topicLabel(ctx);
  const h = GENIUS_ANGLES[ctx.domain];
  const seed = seedFor(debateId, round, personaId, salt);
  const i = round - 1 + salt;
  const peer = lastPeerMessage(personaId, history);
  const fresh = freshnessFlavor(sources, ctx, personaId, history, round, seed);
  const lens = geniusLens(personaId);

  const parts = [
    `${pickSeeded(GENIUS_OPENERS[personaId], seed)} ${label}은 ${pickSeeded(h[personaId], i)}.`,
    fresh,
  ].filter(Boolean) as string[];

  if (ctx.sideA && ctx.sideB && round === 1) {
    parts.push(
      pickSeeded(
        [
          `${ctx.sideA}랑 ${ctx.sideB} 둘 다 변수가 다르거든.`,
          `${ctx.sideA}·${ctx.sideB} 비교는 기준이 먼저임.`,
        ],
        seed + 3,
      ),
    );
  }

  if (peer && round > 1) {
    const qSnippet = extractQuote(peer.content, seed);
    if (qSnippet) {
      parts.push(
        pickSeeded(QUOTE_REBUTTAL, seed)
          .replace("{quote}", qSnippet)
          .replace("{refute}", pickSeeded(REBUTTAL_REFUTES, seed + 1)),
      );
    }
  } else if (round === 1) {
    parts.push(
      pickSeeded(
        [
          `${lens} 시각으로 보면 재밌는 주제임.`,
          `일단 ${label}부터 풀어볼게.`,
        ],
        seed + 2,
      ),
    );
  }

  const wiki = wikiFlavor(sources, ctx, history, seed + 4);
  if (wiki && parts.length < 3) parts.push(wiki);

  return parts.join(" ");
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

  for (let attempt = 0; attempt < 8; attempt++) {
    const content = composeGeniusTurn(
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

  for (let attempt = 8; attempt < 12; attempt++) {
    const content = composeGeniusTurn(
      ctx,
      personaId,
      history,
      round,
      EMPTY_SOURCES,
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

  return composeGeniusTurn(
    ctx,
    personaId,
    history,
    round,
    EMPTY_SOURCES,
    debateId,
    99,
  );
}
