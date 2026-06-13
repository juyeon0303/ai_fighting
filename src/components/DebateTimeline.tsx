"use client";

import type { TimelineEvent } from "@/lib/types";

const TYPE_CONFIG = {
  consensus: {
    icon: "🤝",
    color: "#fbbf24",
    label: "합의",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
  },
  turning_point: {
    icon: "⚡",
    color: "#a78bfa",
    label: "전환",
    ring: "ring-violet-500/30",
    bg: "bg-violet-500/10",
  },
  conflict: {
    icon: "💥",
    color: "#f87171",
    label: "격돌",
    ring: "ring-red-500/30",
    bg: "bg-red-500/10",
  },
};

interface DebateTimelineProps {
  events: TimelineEvent[];
  highlightId: string | null;
}

export function DebateTimeline({ events, highlightId }: DebateTimelineProps) {
  return (
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
                  <div
                    className={`rounded-xl border border-white/6 p-3 transition ${isHighlight ? "border-amber-500/40 bg-amber-500/8" : "bg-white/3"}`}
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
                    <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                      {event.summary}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
