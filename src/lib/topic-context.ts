import type { PersonaId } from "./types";

export type DebateMode =
  | "versus"
  | "proposition"
  | "comparison"
  | "choice"
  | "wh_question"
  | "casual"
  | "topic";

export type TopicDomain =
  | "esports"
  | "food"
  | "tech"
  | "entertainment"
  | "social"
  | "science"
  | "general";

export interface TopicContext {
  mode: DebateMode;
  topic: string;
  displayTopic: string;
  debateQuestion: string;
  sideA: string | null;
  sideB: string | null;
  brief: string;
  domain: TopicDomain;
  anchors: string[];
}

const GREETING_RE =
  /^(하이|하이요|헬로|hello|hi|hey|ㅎㅇ|안녕|안녕하세요|반가워|하이하이)[!.?~\s]*$/i;
const GIBBERISH_RE = /^[ㅋㅎㅠㅜㄱ-ㅎ!?.\s]{1,12}$/;
const VERSUS_RE =
  /^(.+?)\s*(?:vs\.?|VS\.?|versus)\s*(.+)$/i;
const VERSUS_KO_RE = /^(.+?)\s+대\s+(.+)$/;
const SLASH_RE = /^(.+?)\s*[\/·|]\s*(.+)$/;
const COMPARISON_RE =
  /^(.+?)(?:이|가)\s+(.+?)(?:보다|보단)\s*(?:낫다|나아|강하다|좋다|뛰어나다|우월하다|맛있다|재밌다)/;
const COMPARISON_RE2 =
  /^(?:누가\s+더|어느\s+쪽이\s+더|무엇이\s+더)\s*(.+)/;
const PROPOSITION_RE =
  /(?:해야\s*(?:하는|할|하나|할까|하는가)|맞는가|좋은가|될까|할까|해야\s*하나|해야\s*됩|찬성|반대하|동의하)/;
const CHOICE_RE =
  /(?:최고|최강|1위|top\s*\d*|best|가장\s*(?:좋은|맛있는|위대한|강한|중요한)|역대|누가\s*최고)/i;
const WH_RE = /^(?:왜|어떻게|무엇|뭐|언제|어디|어느|어떤)\s+/;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function detectDomain(text: string): TopicDomain {
  const t = text.toLowerCase();
  if (/페이커|쵸비|faker|chovy|롤|lol|lck|lpl|티원|젠지|이스포츠|프로게이머|솔랭|챔피언|월드|msi/.test(t))
    return "esports";
  if (/치킨|피자|떡볶이|마라탕|삼겹|초밥|햄버거|라면|음식|맛|먹|카페|커피|디저트/.test(t))
    return "food";
  if (/react|vue|angular|python|javascript|typescript|ai|인공지능|프로그래밍|코딩|앱|서버|클라우드|iphone|android|삼성|애플/.test(t))
    return "tech";
  if (/영화|드라마|넷플릭스|아이돌|k-pop|음악|게임|애니/.test(t))
    return "entertainment";
  if (/연애|결혼|정치|경제|학교|직장|원격|출근|인간관계|사회/.test(t))
    return "social";
  if (/지구|우주|물리|화학|생물|과학|하늘|DNA|양자/.test(t))
    return "science";
  return "general";
}

function parseVersus(topic: string): { sideA: string; sideB: string } | null {
  for (const re of [VERSUS_RE, VERSUS_KO_RE, SLASH_RE]) {
    const m = topic.match(re);
    if (m) {
      const sideA = clean(m[1]);
      const sideB = clean(m[2]);
      if (sideA.length >= 1 && sideB.length >= 2 && sideB.length <= 80) {
        return { sideA, sideB };
      }
    }
  }
  return null;
}

function parseComparison(topic: string): { sideA: string; sideB: string } | null {
  const m = topic.match(COMPARISON_RE);
  if (m) return { sideA: clean(m[1]), sideB: clean(m[2]) };
  return null;
}

function reframeCasual(topic: string): { displayTopic: string; debateQuestion: string } {
  if (GREETING_RE.test(topic)) {
    return {
      displayTopic: topic,
      debateQuestion: "짧은 일상 인사는 의미 있는 소통인가, 아니면 형식적인 말인가",
    };
  }
  if (GIBBERISH_RE.test(topic) || topic.length <= 2) {
    return {
      displayTopic: topic,
      debateQuestion: `「${topic}」같이 짧거나 애매한 주제도 토론할 가치가 있는가`,
    };
  }
  return {
    displayTopic: topic,
    debateQuestion: `「${topic}」를 긍정적으로 볼 것인가, 비판적으로 볼 것인가`,
  };
}

function buildAnchors(ctx: Partial<TopicContext> & { topic: string }): string[] {
  const anchors = new Set<string>();
  anchors.add(ctx.topic);
  if (ctx.displayTopic) anchors.add(ctx.displayTopic);
  if (ctx.sideA) anchors.add(ctx.sideA);
  if (ctx.sideB) anchors.add(ctx.sideB);
  if (ctx.debateQuestion) {
    const words = ctx.debateQuestion.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
    words.slice(0, 4).forEach((w) => anchors.add(w));
  }
  return [...anchors].filter((a) => a.length >= 1);
}

export function parseTopic(raw: string): TopicContext {
  const topic = clean(raw);
  const domain = detectDomain(topic);

  const versus = parseVersus(topic);
  if (versus) {
    return {
      mode: "versus",
      topic,
      displayTopic: `${versus.sideA} vs ${versus.sideB}`,
      debateQuestion: `${versus.sideA}와 ${versus.sideB} 중 누가/무엇이 더 나은가`,
      sideA: versus.sideA,
      sideB: versus.sideB,
      brief: `자·강·세가 ${versus.sideA} vs ${versus.sideB}를 각자 시각으로 풀어봄`,
      domain,
      anchors: buildAnchors({
        topic,
        sideA: versus.sideA,
        sideB: versus.sideB,
        debateQuestion: `${versus.sideA} ${versus.sideB}`,
      }),
    };
  }

  const comparison = parseComparison(topic);
  if (comparison) {
    return {
      mode: "comparison",
      topic,
      displayTopic: `${comparison.sideA} vs ${comparison.sideB}`,
      debateQuestion: `${comparison.sideA}가 ${comparison.sideB}보다 나은가`,
      sideA: comparison.sideA,
      sideB: comparison.sideB,
      brief: `자·강·세가 ${comparison.sideA} vs ${comparison.sideB} 비교를 각자 풀어봄`,
      domain,
      anchors: buildAnchors({
        topic,
        sideA: comparison.sideA,
        sideB: comparison.sideB,
      }),
    };
  }

  if (COMPARISON_RE2.test(topic)) {
    return {
      mode: "choice",
      topic,
      displayTopic: topic,
      debateQuestion: topic.replace(/\?$/, ""),
      sideA: null,
      sideB: null,
      brief: "자·강·세가 서로 다른 답을 내세우며 대화",
      domain,
      anchors: buildAnchors({ topic, debateQuestion: topic }),
    };
  }

  if (CHOICE_RE.test(topic)) {
    return {
      mode: "choice",
      topic,
      displayTopic: topic,
      debateQuestion: topic,
      sideA: null,
      sideB: null,
      brief: "자·강·세가 각자 다른 후보·관점으로 대화",
      domain,
      anchors: buildAnchors({ topic, debateQuestion: topic }),
    };
  }

  if (WH_RE.test(topic)) {
    return {
      mode: "wh_question",
      topic,
      displayTopic: topic,
      debateQuestion: topic,
      sideA: null,
      sideB: null,
      brief: "자·강·세가 서로 다른 설명·관점으로 대화",
      domain,
      anchors: buildAnchors({ topic, debateQuestion: topic }),
    };
  }

  if (PROPOSITION_RE.test(topic) || /인가\??$|하는가\??$/.test(topic)) {
    return {
      mode: "proposition",
      topic,
      displayTopic: topic,
      debateQuestion: topic,
      sideA: null,
      sideB: null,
      brief: "자·강·세가 주제를 각자 시각으로 대화",
      domain,
      anchors: buildAnchors({ topic, debateQuestion: topic }),
    };
  }

  if (GREETING_RE.test(topic) || topic.length <= 3 || GIBBERISH_RE.test(topic)) {
    const { displayTopic, debateQuestion } = reframeCasual(topic);
    return {
      mode: "casual",
      topic,
      displayTopic,
      debateQuestion,
      sideA: null,
      sideB: null,
      brief: `자·강·세가 「${debateQuestion}」을 각자 풀어봄`,
      domain,
      anchors: buildAnchors({ topic, displayTopic, debateQuestion }),
    };
  }

  return {
    mode: "topic",
    topic,
    displayTopic: topic,
    debateQuestion: `「${topic}」는 전반적으로 긍정적인가, 부정적인가`,
    sideA: null,
    sideB: null,
    brief: "자·강·세가 주제를 각자 시각으로 대화",
    domain,
    anchors: buildAnchors({ topic, debateQuestion: topic }),
  };
}

export function getGeniusLens(
  personaId: PersonaId,
  ctx: TopicContext,
): string {
  const base = {
    atlas: "1차 원리·큰 그림으로 본다",
    cipher: "논리·정의·반례로 짚는다",
    ember: "비유·직관·실험적으로 풀어본다",
  }[personaId];

  return base;
}

/** @deprecated getGeniusLens 사용 */
export function getPersonaStance(
  personaId: PersonaId,
  ctx: TopicContext,
): string {
  return getGeniusLens(personaId, ctx);
}

export function getModeLabel(mode: DebateMode): string {
  const labels: Record<DebateMode, string> = {
    versus: "대결",
    proposition: "찬반",
    comparison: "비교",
    choice: "선택/최고",
    wh_question: "질문",
    casual: "짧은 주제",
    topic: "자유",
  };
  return labels[mode];
}

/** LLM 프롬프트용 — 단톡 맥락 한 줄 */
export function topicChatLine(ctx: TopicContext): string {
  if (ctx.mode === "casual") {
    return `「${ctx.displayTopic}」 얘기를 친구 셋이 단톡하듯 반말로.`;
  }
  if (ctx.sideA && ctx.sideB) {
    return `「${ctx.sideA} vs ${ctx.sideB}」 얘기 중.`;
  }
  return `「${ctx.displayTopic}」 얘기 중.`;
}

/** 과학·기술·찬반 주제만 검색 보강 */
export function topicUsesSearch(ctx: TopicContext): boolean {
  if (ctx.domain === "science" || ctx.domain === "tech") return true;
  if (ctx.mode === "proposition") return true;
  return false;
}
