"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TopicForm() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/debates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      if (!res.ok) throw new Error("생성 실패");

      const debate = await res.json();
      router.push(`/debate/${debate.id}`);
    } catch {
      alert("토론 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 인공지능이 인간의 일자리를 대체해야 하는가?"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-5 pr-36 text-lg text-white placeholder:text-white/30 outline-none transition focus:border-violet-500/50 focus:bg-white/8"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!topic.trim() || loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "생성 중..." : "토론 시작 →"}
        </button>
      </div>
      <p className="mt-3 text-center text-sm text-white/40">
        시작하면 AI들이 백그라운드에서 계속 토론합니다. 자도 됩니다.
      </p>
    </form>
  );
}
