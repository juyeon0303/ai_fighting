import type { DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  factViolatesGroundTruth,
  matchGroundTruth,
  pickGroundTruthCue,
  wikiTitleForEntity,
} from "./domain-ground-truth";
import {
  getWikiContext,
  pickFreshWikiFact,
  pickSeeded,
  type WikiContext,
} from "./wiki-context";

export interface DebateSources {
  primary: WikiContext | null;
  sideA: WikiContext | null;
  sideB: WikiContext | null;
}

async function wikiForSide(name: string): Promise<WikiContext | null> {
  const title = wikiTitleForEntity(name);
  if (title) {
    const byTitle = await getWikiContext(title);
    if (byTitle) return byTitle;
  }
  return getWikiContext(name);
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
  for (let i = 0; i < 6; i++) {
    const fact = pickFreshWikiFact(wiki, history, seed + i);
    if (!fact) continue;
    if (factViolatesGroundTruth(entityName, fact)) continue;
    return fact;
  }
  return null;
}

/** API·엔진 공통 — 검증 팩트 1개 (위키 직접 인용 금지) */
export function factCueForPrompt(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string | null {
  if (personaId === "moderator") return null;

  const seed = round * 11 + (personaId === "pro" ? 1 : personaId === "con" ? 2 : 3);
  const sideName = sideNameForPersona(ctx, personaId);

  if (sideName) {
    const grounded = pickGroundTruthCue(sideName, history, seed);
    if (grounded) return grounded;

    const wiki =
      personaId === "pro" ? sources.sideA : sources.sideB;
    const wikiCue = pickWikiCue(wiki, sideName, history, seed);
    if (wikiCue) return wikiCue;
    return pickGroundTruthCue(sideName, history, seed + 3);
  }

  if (personaId === "neutral" && ctx.sideA && ctx.sideB) {
    const a = pickGroundTruthCue(ctx.sideA, history, seed);
    const b = pickGroundTruthCue(ctx.sideB, history, seed + 1);
    if (a && b) return `${ctx.sideA}:${a}|${ctx.sideB}:${b}`;
    if (a) return a;
    if (b) return b;
  }

  return null;
}

/** 무료 엔진 — 팩트를 말투에 자연스럽게 녹임 (위키·자료상 금지) */
export function weaveFactIntoSpeech(
  fact: string,
  ctx: TopicContext,
  personaId: PersonaId,
  seed: number,
): string {
  const side = sideNameForPersona(ctx, personaId);
  const templates =
    personaId === "neutral"
      ? [
          `${fact} — 비교 기준을 여기에 둬야 함.`,
          `변수는 ${fact} 쪽이야.`,
        ]
      : [
          side ? `${side} 보면 ${fact} 정도로 보임.` : `${fact} 정도로 보임.`,
          `${fact} — 이게 지금 핵심이야.`,
          `요즘은 ${fact} 변수가 크지.`,
        ];
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
