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
  isUnusableWikiFact,
  pickFreshWikiFact,
  pickSeeded,
  wikiRelatesToQuery,
  type WikiContext,
} from "./wiki-context";

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

export async function getDebateSources(
  ctx: TopicContext,
): Promise<DebateSources> {
  const [primary, sideA, sideB] = await Promise.all([
    getWikiContext(ctx.topic),
    ctx.sideA ? wikiForSide(ctx.sideA) : Promise.resolve(null),
    ctx.sideB ? wikiForSide(ctx.sideB) : Promise.resolve(null),
  ]);
  return { primary, sideA, sideB };
}

export function prefetchDebateSources(topic: string): void {
  import("./topic-context").then(({ parseTopic }) => {
    const ctx = parseTopic(topic);
    getDebateSources(ctx).catch(() => {});
  });
}

function sideNameForPersona(
  ctx: TopicContext,
  personaId: PersonaId,
): string | null {
  if (personaId === "pro") return ctx.sideA;
  if (personaId === "con") return ctx.sideB;
  return null;
}

function pickWikiCue(
  wiki: WikiContext | null,
  entityName: string,
  history: DebateMessage[],
  seed: number,
): string | null {
  if (!wiki) return null;
  for (let i = 0; i < 8; i++) {
    const fact = pickFreshWikiFact(wiki, history, seed + i, entityName);
    if (!fact) continue;
    if (factViolatesGroundTruth(entityName, fact)) continue;
    if (!factRelatesToEntity(entityName, fact, wiki)) continue;
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
): string | null {
  const grounded = pickGroundTruthCue(name, history, seed);
  if (grounded) return grounded;
  return pickWikiCue(wiki, name, history, seed);
}

/** API·엔진 공통 — 검증 팩트 1개 (모든 토론 모드) */
export function factCueForPrompt(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string | null {
  if (personaId === "moderator") return null;

  const seed =
    round * 11 + (personaId === "pro" ? 1 : personaId === "con" ? 2 : 3);

  if (ctx.sideA && ctx.sideB) {
    if (personaId === "pro") {
      return pickCueForEntity(ctx.sideA, sources.sideA, history, seed);
    }
    if (personaId === "con") {
      return pickCueForEntity(ctx.sideB, sources.sideB, history, seed);
    }
    if (personaId === "neutral") {
      const a = pickCueForEntity(ctx.sideA, sources.sideA, history, seed);
      const b = pickCueForEntity(ctx.sideB, sources.sideB, history, seed + 1);
      if (a && b) return `${ctx.sideA}:${a}|${ctx.sideB}:${b}`;
      if (a) return `${ctx.sideA}:${a}`;
      if (b) return `${ctx.sideB}:${b}`;
      return null;
    }
  }

  if (personaId === "neutral") return null;

  const topicKey = ctx.displayTopic || ctx.topic;
  return pickWikiCue(sources.primary, topicKey, history, seed);
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
    "설명하려면 {f}부터 봐야 함.",
    "{f} — 여기서 갈림.",
  ],
  general: [
    "{f} 정도로 보임.",
    "{f} — 이게 지금 핵심이야.",
    "변수는 {f} 쪽임.",
  ],
};

/** 무료 엔진 — 팩트를 말투에 자연스럽게 녹임 */
export function weaveFactIntoSpeech(
  fact: string,
  ctx: TopicContext,
  personaId: PersonaId,
  seed: number,
): string {
  const side = sideNameForPersona(ctx, personaId);
  const templates = DOMAIN_WEAVE[ctx.domain].map((t) =>
    t.replace("{side}", side ?? "이쪽").replace("{f}", fact),
  );

  if (personaId === "neutral") {
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

  if (personaId === "neutral" && cue.includes("|")) {
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

  if (personaId === "neutral" && cue.includes(":") && ctx.sideA && ctx.sideB) {
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
