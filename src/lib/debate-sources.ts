import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext, TopicDomain } from "./topic-context";
import {
  factViolatesGroundTruth,
  matchGroundTruth,
  pickGroundTruthCue,
  wikiTitleForEntity,
} from "./domain-ground-truth";
import {
  factRelatesToEntity,
  getWikiContext,
  isDisambiguationWiki,
  isUnusableWikiFact,
  pickFreshWikiFact,
  pickSeeded,
  wikiRelatesToQuery,
  wikiRelatesToTopicQuery,
  type WikiContext,
} from "./wiki-context";

function normToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** 주제 맥락에 맞는 위키인지 (양자→洋瓷 거부) */
export function wikiRelatesToTopicContext(
  ctx: TopicContext,
  wiki: WikiContext,
): boolean {
  if (isDisambiguationWiki(wiki)) return false;

  const topicBlob = `${ctx.topic} ${ctx.debateQuestion}`;
  const wikiBlob = `${wiki.title} ${wiki.extract}`;

  if (ctx.domain === "science" && /양자|다세계|불멸|역학|중첩|관측/.test(topicBlob)) {
    if (/洋瓷|陶瓷|兩者|도자기|두 사람 또는 사물|일정 관계에 있는|뜻은 다음과 같다/.test(wikiBlob)) {
      return false;
    }
    if (!/역학|물리|다세계|중첩|관측|불멸|파동|해석|우주|에버트|자살|실험/.test(wikiBlob)) {
      return false;
    }
  }

  return (
    wikiRelatesToTopicQuery(ctx.topic, wiki) ||
    wikiRelatesToTopicQuery(ctx.displayTopic, wiki)
  );
}

function buildContextWikiQueries(ctx: TopicContext): string[] {
  const t = ctx.topic;
  const ordered: string[] = [];

  if (/다세계/.test(t)) ordered.push("다세계 해석");
  if (/양자/.test(t) && /불멸/.test(t)) {
    ordered.push("양자 자살");
    ordered.push("양자역학의 다세계 해석");
  }
  if (/양자/.test(t)) {
    ordered.push("양자역학");
    ordered.push("양자 역학");
  }
  if (/하늘.*파란|파란.*하늘/.test(t)) ordered.push("레일리 산란");

  ordered.push(t);
  ordered.push(t.replace(/\([^)]*\)/g, "").trim());

  const stripped = t
    .replace(/[?？!！.。]/g, "")
    .replace(/(?:은|는|이|가)\s*.+$/, "")
    .trim();
  if (stripped) ordered.push(stripped);

  return [...new Set(ordered.filter((q) => q.length >= 2))];
}

async function getTopicWikiContext(
  ctx: TopicContext,
): Promise<WikiContext | null> {
  const queries = buildContextWikiQueries(ctx);
  const head = queries.slice(0, 3);
  const tail = queries.slice(3);

  if (head.length > 0) {
    const batch = await Promise.all(head.map((q) => getWikiContext(q)));
    for (const wiki of batch) {
      if (wiki && wikiRelatesToTopicContext(ctx, wiki)) return wiki;
    }
  }

  for (const q of tail) {
    const wiki = await getWikiContext(q);
    if (wiki && wikiRelatesToTopicContext(ctx, wiki)) return wiki;
  }
  return null;
}

function factViolatesTopicContext(ctx: TopicContext, fact: string): boolean {
  const topicBlob = `${ctx.topic} ${ctx.debateQuestion}`;
  if (ctx.domain === "science" && /양자|다세계|불멸/.test(topicBlob)) {
    return /洋瓷|陶瓷|兩者|도자기|두 사람 또는 사물|뜻은 다음과 같다/.test(fact);
  }
  return false;
}

function factMatchesTopic(
  ctx: TopicContext,
  fact: string,
  wiki: WikiContext | null,
): boolean {
  if (factViolatesTopicContext(ctx, fact)) return false;
  const tokens =
    ctx.topic.match(/[가-힣A-Za-z]{2,}/g)?.filter(
      (w) => !/^(은|는|이|가|한|할|가능|해석)$/.test(w),
    ) ?? [];
  const blob = normToken(`${wiki?.title ?? ""} ${fact}`);
  if (tokens.length === 0) return true;
  if (tokens.some((t) => blob.includes(normToken(t)))) return true;
  if (ctx.domain === "science") {
    return /역학|다세계|관측|중첩|불멸|물리|우주|실험/.test(blob);
  }
  return true;
}

export interface DebateSources {
  primary: WikiContext | null;
  sideA: WikiContext | null;
  sideB: WikiContext | null;
}

async function wikiForSide(name: string): Promise<WikiContext | null> {
  const tries = new Set<string>();
  tries.add(name);
  const title = wikiTitleForEntity(name);
  if (title) tries.add(title);

  const lower = name.toLowerCase();
  if (/^[a-z]{2,12}$/.test(lower)) {
    tries.add(`${name}.js`);
    tries.add(`${name} (JavaScript)`);
  }

  for (const query of tries) {
    const wiki = await getWikiContext(query);
    if (wiki && wikiRelatesToQuery(name, wiki)) return wiki;
  }
  return null;
}

const sourcesCache = new Map<string, Promise<DebateSources>>();

function sourcesCacheKey(ctx: TopicContext): string {
  return `${ctx.topic}|${ctx.sideA ?? ""}|${ctx.sideB ?? ""}`;
}

async function loadDebateSources(ctx: TopicContext): Promise<DebateSources> {
  const [primary, sideA, sideB] = await Promise.all([
    getTopicWikiContext(ctx),
    ctx.sideA ? wikiForSide(ctx.sideA) : Promise.resolve(null),
    ctx.sideB ? wikiForSide(ctx.sideB) : Promise.resolve(null),
  ]);
  return { primary, sideA, sideB };
}

export async function getDebateSources(
  ctx: TopicContext,
): Promise<DebateSources> {
  const key = sourcesCacheKey(ctx);
  let pending = sourcesCache.get(key);
  if (!pending) {
    pending = loadDebateSources(ctx);
    sourcesCache.set(key, pending);
    pending.catch(() => sourcesCache.delete(key));
  }
  return pending;
}

export function prefetchDebateSources(topic: string): void {
  import("./topic-context").then(({ parseTopic }) => {
    const ctx = parseTopic(topic);
    getDebateSources(ctx).catch(() => {});
  });
}

function entityForPersona(
  ctx: TopicContext,
  personaId: PersonaId,
): string | null {
  if (personaId === "atlas") return ctx.sideA;
  if (personaId === "cipher") return ctx.sideB;
  return ctx.displayTopic || ctx.topic;
}

function pickWikiCue(
  wiki: WikiContext | null,
  entityName: string,
  history: DebateMessage[],
  seed: number,
  ctx?: TopicContext,
): string | null {
  if (!wiki) return null;
  for (let i = 0; i < 8; i++) {
    const fact = pickFreshWikiFact(wiki, history, seed + i, entityName);
    if (!fact) continue;
    if (factViolatesGroundTruth(entityName, fact)) continue;
    if (ctx && !ctx.sideA && !ctx.sideB) {
      if (!factMatchesTopic(ctx, fact, wiki)) continue;
    } else if (!factRelatesToEntity(entityName, fact, wiki)) {
      continue;
    }
    if (ctx && factViolatesTopicContext(ctx, fact)) continue;
    if (isUnusableWikiFact(fact)) continue;
    return fact;
  }
  return null;
}

function pickCueForEntity(
  name: string,
  wiki: WikiContext | null,
  history: DebateMessage[],
  seed: number,
  ctx?: TopicContext,
): string | null {
  const grounded = pickGroundTruthCue(name, history, seed);
  if (grounded) return grounded;
  return pickWikiCue(wiki, name, history, seed, ctx);
}

/** API·엔진 공통 — 검증 팩트 1개 (모든 토론 모드) */
export function factCueForPrompt(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string | null {
  const seed =
    round * 11 + (personaId === "atlas" ? 1 : personaId === "cipher" ? 2 : 3);

  if (ctx.sideA && ctx.sideB) {
    if (personaId === "atlas") {
      return pickCueForEntity(ctx.sideA, sources.sideA, history, seed, ctx);
    }
    if (personaId === "cipher") {
      return pickCueForEntity(ctx.sideB, sources.sideB, history, seed, ctx);
    }
    const a = pickCueForEntity(ctx.sideA, sources.sideA, history, seed, ctx);
    const b = pickCueForEntity(ctx.sideB, sources.sideB, history, seed + 1, ctx);
    if (a && b) return `${ctx.sideA}:${a}|${ctx.sideB}:${b}`;
    if (a) return `${ctx.sideA}:${a}`;
    if (b) return `${ctx.sideB}:${b}`;
    return null;
  }

  const topicKey = ctx.displayTopic || ctx.topic;
  return pickWikiCue(sources.primary, topicKey, history, seed, ctx);
}

const DOMAIN_WEAVE: Record<TopicDomain, string[]> = {
  esports: [
    "{side} 기준 {f}.",
    "요즘 {f} 변수가 큼.",
    "{f} — 경기 흐름 보면 이게 핵심임.",
  ],
  food: [
    "솔직히 {f}.",
    "먹어보면 {f} 차이 남.",
    "{f} — 입맛·상황에 따라 갈림.",
  ],
  tech: [
    "써보면 {f}.",
    "실무에서 {f} 체감됨.",
    "{f}가 지금 변수임.",
  ],
  entertainment: [
    "보면 {f}.",
    "소비할 때 {f} 느낌임.",
    "{f} — 취향 갈림 포인트임.",
  ],
  social: [
    "현실적으로 {f}.",
    "사람마다 {f} 체감이 다름.",
    "{f} — 조건 따라 답이 바뀜.",
  ],
  science: [
    "근거 보면 {f}.",
    "설명하려면 {f}부터 봐야 해.",
    "{f} — 여기서 갈려.",
  ],
  general: [
    "{f} 정도로 보여.",
    "{f} — 이게 지금 핵심이야.",
    "변수는 {f} 쪽이야.",
  ],
};

/** 무료 엔진 — 팩트를 말투에 자연스럽게 녹임 */
export function weaveFactIntoSpeech(
  fact: string,
  ctx: TopicContext,
  personaId: PersonaId,
  seed: number,
): string {
  const side = entityForPersona(ctx, personaId);
  const templates = DOMAIN_WEAVE[ctx.domain].map((t) =>
    t.replace("{side}", side ?? "이 주제").replace("{f}", fact),
  );

  if (personaId === "ember") {
    return pickSeeded(
      [
        `${fact} — 비교 기준을 여기에 둬야 함.`,
        `양쪽 보면 ${fact} 변수가 갈림.`,
      ],
      seed,
    );
  }

  return pickSeeded(templates, seed);
}

export function speechFactLine(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  seed: number,
): string | null {
  const cue = factCueForPrompt(sources, ctx, personaId, history, round + seed);
  if (!cue) return null;

  if (personaId === "ember" && cue.includes("|")) {
    const parts = cue.split("|");
    const aFact = parts[0]?.includes(":")
      ? parts[0].split(":").slice(1).join(":")
      : parts[0];
    const bFact = parts[1]?.includes(":")
      ? parts[1].split(":").slice(1).join(":")
      : parts[1];
    if (ctx.sideA && ctx.sideB && aFact && bFact) {
      return pickSeeded(
        [
          `${ctx.sideA}는 ${aFact}, ${ctx.sideB}는 ${bFact} 쪽으로 정리됨.`,
          `기준만 다르면 ${ctx.sideA}(${aFact}) vs ${ctx.sideB}(${bFact})로 갈림.`,
        ],
        seed,
      );
    }
  }

  if (personaId === "ember" && cue.includes(":") && ctx.sideA && ctx.sideB) {
    const [label, fact] = [cue.split(":")[0], cue.split(":").slice(1).join(":")];
    return `${label} 쪽은 ${fact} 정도로 보임.`;
  }

  return weaveFactIntoSpeech(cue, ctx, personaId, seed);
}

/** @deprecated use factCueForPrompt */
export function wikiCueForPrompt(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string | null {
  return factCueForPrompt(sources, ctx, personaId, history, round);
}

/** @deprecated use speechFactLine */
export function wikiLineForSpeech(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  seed: number,
): string | null {
  return speechFactLine(sources, ctx, personaId, history, round, seed);
}

export function hasKnownEntity(ctx: TopicContext): boolean {
  if (ctx.sideA && matchGroundTruth(ctx.sideA)) return true;
  if (ctx.sideB && matchGroundTruth(ctx.sideB)) return true;
  return false;
}
