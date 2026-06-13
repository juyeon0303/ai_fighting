export type DebateMode = "versus" | "proposition" | "open";

export interface TopicContext {
  mode: DebateMode;
  topic: string;
  sideA: string | null;
  sideB: string | null;
  brief: string;
}

function parseVersus(topic: string): { sideA: string; sideB: string } | null {
  const patterns = [
    /^(.+?)\s*(?:vs\.?|VS\.?|대)\s*(.+)$/i,
    /^(.+?)\s*\/\s*(.+)$/,
    /^(.+?)\s*·\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = topic.match(pattern);
    if (match) {
      const sideA = match[1].trim();
      const sideB = match[2].trim();
      if (sideA.length >= 1 && sideB.length >= 1) {
        return { sideA, sideB };
      }
    }
  }
  return null;
}

function isProposition(topic: string): boolean {
  return /해야\s*(하는|할|하나|할까|하는가)|맞는가|좋은가|될까|인가\??|할까\??|해야\s*하나/.test(
    topic,
  );
}

export function parseTopic(topic: string): TopicContext {
  const trimmed = topic.trim();
  const versus = parseVersus(trimmed);

  if (versus) {
    return {
      mode: "versus",
      topic: trimmed,
      sideA: versus.sideA,
      sideB: versus.sideB,
      brief: `「${versus.sideA}」와 「${versus.sideB}」 중 어느 쪽이 더 낫거나 우위인지 겨루는 대결 토론입니다. 찬성 AI는 ${versus.sideA} 편, 반대 AI는 ${versus.sideB} 편입니다.`,
    };
  }

  if (isProposition(trimmed)) {
    return {
      mode: "proposition",
      topic: trimmed,
      sideA: null,
      sideB: null,
      brief: `「${trimmed}」에 대한 찬반 토론입니다. 찬성 AI는 긍정(찬성), 반대 AI는 부정(반대) 입장입니다.`,
    };
  }

  return {
    mode: "open",
    topic: trimmed,
    sideA: null,
    sideB: null,
    brief: `「${trimmed}」를 중심으로 자유 토론입니다. 찬성 AI는 이 주제의 긍정적·유리한 측면, 반대 AI는 부정적·문제되는 측면을 맡습니다.`,
  };
}

export function getPersonaStance(
  personaId: "pro" | "con" | "neutral" | "moderator",
  ctx: TopicContext,
): string {
  if (ctx.mode === "versus" && ctx.sideA && ctx.sideB) {
    switch (personaId) {
      case "pro":
        return `「${ctx.sideA}」 편 — ${ctx.sideA}가 ${ctx.sideB}보다 낫다는 입장`;
      case "con":
        return `「${ctx.sideB}」 편 — ${ctx.sideB}가 ${ctx.sideA}보다 낫다는 입장`;
      case "neutral":
        return "양측 근거를 비교·분석하는 중립 입장";
      case "moderator":
        return "대결 토론 진행자";
    }
  }

  switch (personaId) {
    case "pro":
      return "찬성·긍정 입장";
    case "con":
      return "반대·비판 입장";
    case "neutral":
      return "중립·분석 입장";
    case "moderator":
      return "토론 진행자";
  }
}
