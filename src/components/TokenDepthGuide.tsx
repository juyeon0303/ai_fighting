"use client";

import type { ApiLayout } from "@/lib/types";
import {
  budgetForTurns,
  DEPTH_TIERS,
  estimateTokenBudget,
} from "@/lib/token-budget-guide";
import { TURNS_PER_ROUND } from "@/lib/personas";

function formatBudgetK(need: number): string {
  if (need >= 10_000) return `${Math.round(need / 10_000)}만`;
  return `${Math.round(need / 1_000)}k`;
}

interface TokenDepthGuideProps {
  budget: number;
  layout: ApiLayout;
  tokenSaveMode: boolean;
}

export function TokenDepthGuide({
  budget,
  layout,
  tokenSaveMode,
}: TokenDepthGuideProps) {
  const current = estimateTokenBudget(budget, layout, undefined, tokenSaveMode);
  const deepNeed = budgetForTurns(15 * TURNS_PER_ROUND, tokenSaveMode, layout);

  return (
    <div className="rounded-lg border border-[var(--brand-gold)]/10 bg-black/15 px-3 py-2.5">
      <p className="text-[10px] font-medium tracking-[0.12em] text-[var(--brand-gold)]/50">
        예산 가이드
        <span className="ml-1.5 font-normal tracking-normal text-[var(--brand-paper)]/30">
          (대화 길어질수록 토큰 ↑)
        </span>
      </p>

      <ul className="mt-2 space-y-1">
        {DEPTH_TIERS.map((tier) => {
          const need = budgetForTurns(
            tier.rounds * TURNS_PER_ROUND,
            tokenSaveMode,
            layout,
          );
          const active = budget >= need * 0.92;
          return (
            <li
              key={tier.id}
              className={`flex items-baseline justify-between gap-2 text-[11px] leading-snug ${
                active
                  ? "text-[var(--brand-paper)]/70"
                  : "text-[var(--brand-paper)]/35"
              }`}
            >
              <span>
                {tier.shortLabel}
                <span className="text-[var(--brand-paper)]/25">
                  {" "}
                  · {tier.rounds}라운드
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-[var(--brand-gold)]/55">
                {formatBudgetK(need)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 border-t border-[var(--brand-gold)]/8 pt-2 text-[11px] leading-relaxed text-[var(--brand-paper)]/55">
        선택{" "}
        <span className="tabular-nums text-[var(--brand-gold-light)]/90">
          {budget.toLocaleString()}
        </span>
        {" → "}
        {current.compactSummary}
      </p>

      {budget < deepNeed && (
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--brand-paper)]/35">
          「와…」 수준은{" "}
          <span className="text-[var(--brand-gold)]/70">
            {formatBudgetK(deepNeed)}+
          </span>
          {" "}권장 · 3만은 가벼운 수다 정도
        </p>
      )}
    </div>
  );
}
