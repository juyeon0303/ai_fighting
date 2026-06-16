/**
 * 토론 깊이별 예상 토큰 소모 시뮬레이션
 * 실행: npx tsx scripts/simulate-token-depth.ts
 */
import {
  budgetForTurns,
  DEPTH_TIERS,
  estimateTokenBudget,
  turnsAffordable,
} from "../src/lib/token-budget-guide";
import { TURNS_PER_ROUND } from "../src/lib/personas";

const BUDGETS = [30_000, 100_000, 150_000, 300_000, 500_000, 1_000_000];

function main() {
  console.log("\n=== 토론 깊이 × 토큰 예산 시뮬레이션 (Gemini 단일) ===\n");

  for (const save of [false, true] as const) {
    const mode = save ? "절약 모드" : "일반 모드";
    console.log(`--- ${mode} ---\n`);
    console.log(
      "깊이".padEnd(16),
      "라운드".padStart(6),
      "발언".padStart(6),
      "필요 토큰".padStart(12),
    );
    console.log("-".repeat(44));

    for (const tier of DEPTH_TIERS) {
      const turns = tier.rounds * TURNS_PER_ROUND;
      const need = budgetForTurns(turns, save);
      console.log(
        tier.shortLabel.padEnd(16),
        String(tier.rounds).padStart(6),
        String(turns).padStart(6),
        need.toLocaleString().padStart(12),
      );
    }
    console.log();
  }

  console.log("--- 예산별 실제 가능 발언 수 (일반 모드) ---\n");
  for (const budget of BUDGETS) {
    const turns = turnsAffordable(budget, false);
    const rounds = Math.floor(turns / TURNS_PER_ROUND);
    const guide = estimateTokenBudget(budget, "gemini_only", 1500, false);
    console.log(
      `${budget.toLocaleString().padStart(10)} → ${turns}발언 (${rounds}R) · ${guide.depthLabel} · ${guide.estimatedUsd}`,
    );
  }

  const wowBudget = budgetForTurns(15 * TURNS_PER_ROUND, false);
  console.log(
    `\n깊은 해석(15R) 필요: ~${wowBudget.toLocaleString()} · 권장 15~18만\n`,
  );
}

main();
