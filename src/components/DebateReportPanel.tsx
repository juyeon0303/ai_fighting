"use client";

import type { DebateReport } from "@/lib/types";

interface DebateReportPanelProps {
  report: DebateReport | null;
  reportStatus: string;
  visible: boolean;
  onClose: () => void;
}

function Section({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-sm leading-relaxed text-white/70"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DebateReportPanel({
  report,
  reportStatus,
  visible,
  onClose,
}: DebateReportPanelProps) {
  if (!visible) return null;

  return (
    <div className="report-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="report-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12101c] p-6 shadow-2xl sm:rounded-3xl">
        {reportStatus === "generating" && !report && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
            <p className="text-sm text-white/50">최종 보고서 작성 중...</p>
            <p className="mt-1 text-xs text-white/25">
              AI들이 토론 결과를 종합하고 있습니다
            </p>
          </div>
        )}

        {report && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                  최종 보고서
                </span>
                <h2 className="mt-2 text-xl font-bold text-white">
                  {report.title}
                </h2>
                <p className="mt-1 text-xs text-white/30">
                  {new Date(report.generatedAt).toLocaleString("ko-KR")} 생성
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 transition hover:bg-white/5"
              >
                닫기
              </button>
            </div>

            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
                요약
              </h3>
              <p className="text-sm leading-relaxed text-white/80">
                {report.executiveSummary}
              </p>
            </div>

            <Section title="중간 합의 포인트" items={report.consensusPoints} color="#fbbf24" />
            <Section title="찬성 핵심 논거" items={report.proArguments} color="#22c55e" />
            <Section title="반대 핵심 논거" items={report.conArguments} color="#ef4444" />
            <Section title="미해결 쟁점" items={report.unresolvedIssues} color="#94a3b8" />

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                최종 결론
              </h3>
              <p className="text-sm leading-relaxed text-white/85">
                {report.finalConclusion}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/8 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
                권고안
              </h3>
              <p className="text-sm leading-relaxed text-white/85">
                {report.recommendation}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
