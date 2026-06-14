"use client";

import { useEffect, useState } from "react";
import type { TimelineEvent } from "@/lib/types";

const TYPE_CONFIG = {
  consensus: {
    icon: "🤝",
    color: "#fbbf24",
    label: "합의",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
    modalTitle: "중간 합의안",
  },
  turning_point: {
    icon: "⚡",
    color: "#a78bfa",
    label: "전환",
    ring: "ring-violet-500/30",
    bg: "bg-violet-500/10",
    modalTitle: "토론 전환점",
  },
  conflict: {
    icon: "💥",
    color: "#f87171",
    label: "격돌",
    ring: "ring-red-500/30",
    bg: "bg-red-500/10",
    modalTitle: "격돌 포인트",
  },
};

interface DebateTimelineProps {
  events: TimelineEvent[];
  highlightId: string | null;
}

export function DebateTimeline({ events, highlightId }: DebateTimelineProps) {
  const [expanded, setExpanded] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <aside className="flex h-full w-72 shrink-0 flex-col border-l border-white/8 bg-black/20">
        <div className="border-b border-white/8 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            타임라인
          </h2>
          <p className="mt-0.5 text-[11px] text-white/25">
            합의안 · 전환점 · 격돌
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-white/25">
              토론이 진행되면
              <br />
              중간 합의안이 여기에 쌓입니다
            </div>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute bottom-2 left-[15px] top-2 w-px bg-white/10" />
              {events.map((event) => {
                const cfg = TYPE_CONFIG[event.type];
                const isHighlight = event.id === highlightId;
                const isConsensus = event.type === "consensus";

                return (
                  <div
                    key={event.id}
                    className={`timeline-item relative pb-4 pl-8 ${isHighlight ? "timeline-highlight" : ""}`}
                  >
                    <div
                      className={`absolute left-2 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] ring-2 ${cfg.ring} ${cfg.bg}`}
                    >
                      {cfg.icon}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(event)}
                      className={`w-full cursor-pointer rounded-xl border border-white/6 p-3 text-left transition hover:border-white/15 hover:bg-white/6 ${isHighlight ? "border-amber-500/40 bg-amber-500/8" : "bg-white/3"}`}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-semibold uppercase"
                          style={{ color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-white/25">
                          R{event.round}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-white/80">
                        {event.title}
                      </p>
                      <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-white/40">
                        {event.summary}
                      </p>
                      {isConsensus && (
                        <p className="mt-2 text-[10px] text-amber-400/70">
                          탭해서 크게 보기
                        </p>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {expanded && (
        <div
          className="report-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setExpanded(null)}
          role="presentation"
        >
          <div
            className="report-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12101c] p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-modal-title"
          >
            {(() => {
              const cfg = TYPE_CONFIG[expanded.type];
              return (
                <>
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          color: cfg.color,
                          backgroundColor: `${cfg.color}18`,
                        }}
                      >
                        <span>{cfg.icon}</span>
                        {cfg.modalTitle}
                      </span>
                      <p className="mt-2 text-xs text-white/35">
                        라운드 {expanded.round}
                      </p>
                      <h2
                        id="timeline-modal-title"
                        className="mt-3 text-xl font-bold leading-snug text-white sm:text-2xl"
                      >
                        {expanded.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(null)}
                      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 transition hover:bg-white/5"
                    >
                      닫기
                    </button>
                  </div>

                  <div
                    className="rounded-2xl border px-5 py-4"
                    style={{
                      borderColor: `${cfg.color}33`,
                      backgroundColor: `${cfg.color}0c`,
                    }}
                  >
                    <p className="text-base leading-relaxed text-white/90 sm:text-lg sm:leading-relaxed">
                      {expanded.summary}
                    </p>
                  </div>

                  <p className="mt-4 text-center text-[11px] text-white/25">
                    바깥 영역 클릭 또는 Esc로 닫기
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
