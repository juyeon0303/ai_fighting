"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Debate } from "@/lib/types";

const STATUS_LABEL: Record<Debate["status"], string> = {
  active: "진행 중",
  paused: "일시정지",
  ended: "종료",
};

const STATUS_COLOR: Record<Debate["status"], string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-amber-500/20 text-amber-400",
  ended: "bg-white/10 text-white/50",
};

export function DebateList() {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/debates")
      .then((r) => r.json())
      .then(setDebates)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
      </div>
    );
  }

  if (debates.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-white/30">
        아직 토론이 없습니다. 위에서 주제를 던져보세요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {debates.map((debate) => (
        <Link
          key={debate.id}
          href={`/debate/${debate.id}`}
          className="group flex items-center justify-between rounded-2xl border border-white/8 bg-white/3 px-5 py-4 transition hover:border-violet-500/30 hover:bg-white/6"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white group-hover:text-violet-200">
              {debate.topic}
            </p>
            <p className="mt-1 text-xs text-white/35">
              라운드 {debate.round} ·{" "}
              {new Date(debate.updatedAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <span
            className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[debate.status]}`}
          >
            {STATUS_LABEL[debate.status]}
          </span>
        </Link>
      ))}
    </div>
  );
}
