import type { ApiLayout } from "./types";
import { DEFAULT_TURN_INTERVAL_MS, TURNS_PER_ROUND } from "./personas";

/** 토론 1턴(발언 1개) 평균 토큰 — 압축 프롬프트·짧은 출력 기준 */
const TOKENS_PER_TURN: Record<ApiLayout, number> = {
  openai_only: 420,
  gemini_only: 380,
  gpt_vs_gemini: 450,
};

/** gpt-5.4-mini 기준 대략 blended $/1M tokens */
const USD_PER_MILLION: Record<ApiLayout, number> = {
  openai_only: 0.4,
  gemini_only: 0.15,
  gpt_vs_gemini: 0.28,
};

export interface TokenBudgetGuide {
  budget: number;
  tokensPerTurn: number;
  estimatedTurns: number;
  estimatedRounds: number;
  estimatedHours: number;
  estimatedUsd: string;
  summary: string;
}

export function estimateTokenBudget(
  budget: number,
  layout: ApiLayout = "openai_only",
  turnIntervalMs = DEFAULT_TURN_INTERVAL_MS,
): TokenBudgetGuide {
  const tokensPerTurn = TOKENS_PER_TURN[layout];
  const estimatedTurns = Math.max(1, Math.floor(budget / tokensPerTurn));
  const estimatedRounds = Math.max(1, Math.floor(estimatedTurns / TURNS_PER_ROUND));
  const estimatedHours =
    Math.round(((estimatedTurns * turnIntervalMs) / 3_600_000) * 10) / 10;
  const usd = (budget / 1_000_000) * USD_PER_MILLION[layout];
  const estimatedUsd =
    usd < 0.01 ? "약 $0.01 미만" : `약 $${usd.toFixed(2)}`;

  const layoutLabel =
    layout === "gpt_vs_gemini"
      ? "GPT+Gemini 교차"
      : layout === "gemini_only"
        ? "Gemini"
        : "GPT";

  const intervalSec = Math.round(turnIntervalMs / 100) / 10;
  const summary = `${budget.toLocaleString()} 토큰 ≈ 발언 ${estimatedTurns}개(라운드 ${estimatedRounds}회) · ${layoutLabel} · ${estimatedHours}시간 분량(${intervalSec}초 간격) · ${estimatedUsd}`;

  return {
    budget,
    tokensPerTurn,
    estimatedTurns,
    estimatedRounds,
    estimatedHours,
    estimatedUsd,
    summary,
  };
}
