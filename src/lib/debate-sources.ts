import type { DebateMessage } from "./types";
import type { TopicContext } from "./topic-context";
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

export async function getDebateSources(
  ctx: TopicContext,
): Promise<DebateSources> {
  const [primary, sideA, sideB] = await Promise.all([
    getWikiContext(ctx.topic),
    ctx.sideA ? getWikiContext(ctx.sideA) : Promise.resolve(null),
    ctx.sideB ? getWikiContext(ctx.sideB) : Promise.resolve(null),
  ]);
  return { primary, sideA, sideB };
}

export function prefetchDebateSources(topic: string): void {
  import("./topic-context").then(({ parseTopic }) => {
    const ctx = parseTopic(topic);
    getDebateSources(ctx).catch(() => {});
  });
}

/** API 프롬프트용 — 아직 안 쓴 위키 사실 1개 */
export function wikiCueForPrompt(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: "pro" | "con" | "neutral" | "moderator",
  history: DebateMessage[],
  round: number,
): string | null {
  const seed = round * 11 + (personaId === "pro" ? 1 : personaId === "con" ? 2 : 3);

  const pick = (wiki: WikiContext | null, label?: string): string | null => {
    if (!wiki) return null;
    const fact = pickFreshWikiFact(wiki, history, seed);
    if (!fact) return null;
    return label ? `${label}:${fact}` : fact;
  };

  if (personaId === "pro" && sources.sideA) {
    return pick(sources.sideA, sources.sideA.title);
  }
  if (personaId === "con" && sources.sideB) {
    return pick(sources.sideB, sources.sideB.title);
  }
  if (sources.primary) {
    return pick(sources.primary, sources.primary.title);
  }
  if (ctx.sideA && sources.sideA) {
    return pick(sources.sideA, ctx.sideA);
  }
  return null;
}

/** 무료 엔진 발언에 자연스럽게 녹일 위키 한 줄 */
export function wikiLineForSpeech(
  sources: DebateSources,
  ctx: TopicContext,
  personaId: "pro" | "con" | "neutral" | "moderator",
  history: DebateMessage[],
  round: number,
  seed: number,
): string | null {
  const cue = wikiCueForPrompt(sources, ctx, personaId, history, round + seed);
  if (!cue) return null;

  const fact = cue.includes(":") ? cue.split(":").slice(1).join(":") : cue;
  const title =
    personaId === "pro"
      ? (sources.sideA?.title ?? ctx.sideA)
      : personaId === "con"
        ? (sources.sideB?.title ?? ctx.sideB)
        : sources.primary?.title;

  const templates = [
    title ? `${title} 위키 보면 ${fact} 정도임.` : `${fact} (위키).`,
    `자료상 ${fact} — 이걸로 한번 밀어볼게.`,
    `흔한 말 말고, ${fact} 쪽이 포인트임.`,
  ];
  return pickSeeded(templates, seed);
}
