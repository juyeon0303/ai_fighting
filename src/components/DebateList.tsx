"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Debate } from "@/lib/types";
import { DeleteDebateButton } from "./DeleteDebateButton";

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

  function handleDeleted(id: string) {
    setDebates((prev) => prev.filter((d) => d.id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
      </div>
    );
  }

  if (debates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/8 py-10 text-center text-xs text-white/30">
        아직 토론이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {debates.map((debate) => (
        <div
          key={debate.id}
          className="group flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.04]"
        >
          <Link
            href={`/debate/${debate.id}`}
            className="min-w-0 flex-1"
          >
            <p className="truncate text-sm text-white/90 group-hover:text-white">
              {debate.topic}
            </p>
            <p className="mt-0.5 text-[11px] text-white/30">
              {new Date(debate.updatedAt).toLocaleString("ko-KR")}
            </p>
          </Link>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[debate.status]}`}
          >
            {STATUS_LABEL[debate.status]}
          </span>
          <DeleteDebateButton
            debateId={debate.id}
            topic={debate.topic}
            onDeleted={() => handleDeleted(debate.id)}
          />
        </div>
      ))}
    </div>
  );
}
