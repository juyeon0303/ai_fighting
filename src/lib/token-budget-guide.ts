import type { ApiLayout } from "./types";
import { DEFAULT_TURN_INTERVAL_MS, TURNS_PER_ROUND } from "./personas";

/** gpt-5.4-mini / gemini blended $/1M tokens */
const USD_PER_MILLION: Record<ApiLayout, number> = {
  openai_only: 0.4,
  gemini_only: 0.15,
  gpt_vs_gemini: 0.28,
};

const LAYOUT_TOKEN_SCALE: Record<ApiLayout, number> = {
  gemini_only: 1,
  openai_only: 1.08,
  gpt_vs_gemini: 1.12,
};

export interface DepthTier {
  id: string;
  shortLabel: string;
  rounds: number;
  budgetHint: string;
}

/** UI용 깊이 구간 — simulate-token-depth.ts와 동일 기준 */
export const DEPTH_TIERS: DepthTier[] = [
  {
    id: "light",
    shortLabel: "가벼운 수다",
    rounds: 5,
    budgetHint: "3만",
  },
  {
    id: "mid",
    shortLabel: "쟁점 분화",
    rounds: 10,
    budgetHint: "7~10만",
  },
  {
    id: "deep",
    shortLabel: "깊은 해석",
    rounds: 15,
    budgetHint: "15만 권장",
  },
  {
    id: "long",
    shortLabel: "장문 토론",
    rounds: 20,
    budgetHint: "24만+",
  },
];

/** 발언 1회 — 대화가 길어질수록 입력 토큰 증가 */
export function tokensForTurn(
  messageIndex: number,
  tokenSaveMode: boolean,
  layout: ApiLayout = "gemini_only",
): number {
  const scale = LAYOUT_TOKEN_SCALE[layout];
  const systemOpening = tokenSaveMode ? 420 : 620;
  const historyPerMsg = tokenSaveMode ? 55 : 95;
  const nudge = tokenSaveMode ? 50 : 85;
  const output = tokenSaveMode ? 45 : 115;
  const searchOverhead = tokenSaveMode ? 20 : 45;
  const retryBuffer = 1.08;

  const input =
    systemOpening + messageIndex * historyPerMsg + nudge + searchOverhead;
  return Math.round((input + output) * retryBuffer * scale);
}

export function budgetForTurns(
  turns: number,
  tokenSaveMode: boolean,
  layout: ApiLayout = "gemini_only",
): number {
  let sum = 0;
  for (let i = 0; i < turns; i++) {
    sum += tokensForTurn(i, tokenSaveMode, layout);
  }
  return sum;
}

export function turnsAffordable(
  budget: number,
  tokenSaveMode: boolean,
  layout: ApiLayout = "gemini_only",
): number {
  let used = 0;
  let turns = 0;
  while (turns < 500) {
    const next = tokensForTurn(turns, tokenSaveMode, layout);
    if (used + next > budget) break;
    used += next;
    turns++;
  }
  return turns;
}

export function roundsAffordable(
  budget: number,
  tokenSaveMode: boolean,
  layout: ApiLayout = "gemini_only",
): number {
  return Math.floor(
    turnsAffordable(budget, tokenSaveMode, layout) / TURNS_PER_ROUND,
  );
}

export interface TokenBudgetGuide {
  budget: number;
  estimatedTurns: number;
  estimatedRounds: number;
  estimatedHours: number;
  estimatedUsd: string;
  depthLabel: string;
  summary: string;
  compactSummary: string;
}

function depthLabelForRounds(rounds: number): string {
  if (rounds >= 15) return DEPTH_TIERS[2]!.shortLabel;
  if (rounds >= 10) return DEPTH_TIERS[1]!.shortLabel;
  if (rounds >= 5) return DEPTH_TIERS[0]!.shortLabel;
  return "짧은 체험";
}

export function estimateTokenBudget(
  budget: number,
  layout: ApiLayout = "gemini_only",
  turnIntervalMs = DEFAULT_TURN_INTERVAL_MS,
  tokenSaveMode = false,
): TokenBudgetGuide {
  const estimatedTurns = Math.max(
    1,
    turnsAffordable(budget, tokenSaveMode, layout),
  );
  const estimatedRounds = Math.max(
    1,
    Math.floor(estimatedTurns / TURNS_PER_ROUND),
  );
  const estimatedHours =
    Math.round(((estimatedTurns * turnIntervalMs) / 3_600_000) * 10) / 10;
  const usd = (budget / 1_000_000) * USD_PER_MILLION[layout];
  const estimatedUsd =
    usd < 0.01 ? "약 $0.01 미만" : `약 $${usd.toFixed(2)}`;

  const layoutLabel =
    layout === "gpt_vs_gemini"
      ? "Mix"
      : layout === "gemini_only"
        ? "Gemini"
        : "GPT";

  const depthLabel = depthLabelForRounds(estimatedRounds);
  const modeNote = tokenSaveMode ? " · 절약" : "";
  const summary = `${budget.toLocaleString()} 토큰 → 발언 약 ${estimatedTurns}개(${estimatedRounds}라운드) · ${depthLabel} · ${layoutLabel}${modeNote} · ${estimatedUsd}`;
  const compactSummary = `약 ${estimatedTurns}발언 · ${estimatedRounds}라운드 · ${depthLabel}`;

  return {
    budget,
    estimatedTurns,
    estimatedRounds,
    estimatedHours,
    estimatedUsd,
    depthLabel,
    summary,
    compactSummary,
  };
}

export function recommendedBudgetForDepth(
  tierId: DepthTier["id"],
  tokenSaveMode: boolean,
  layout: ApiLayout = "gemini_only",
): number {
  const tier = DEPTH_TIERS.find((t) => t.id === tierId) ?? DEPTH_TIERS[2]!;
  const need = budgetForTurns(
    tier.rounds * TURNS_PER_ROUND,
    tokenSaveMode,
    layout,
  );
  return Math.ceil(need / 10_000) * 10_000;
}
