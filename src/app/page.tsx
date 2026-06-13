import { TopicForm } from "@/components/TopicForm";
import { DebateList } from "@/components/DebateList";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0c0a14]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-16">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-xs text-violet-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            24/7 AI 토론 아레나
          </div>
          <h1 className="mb-4 text-4xl font-black tracking-tight md:text-5xl">
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              AI 끝장토론
            </span>
          </h1>
          <p className="mx-auto max-w-lg text-white/50">
            찬성 AI, 반대 AI, 중립 AI가 백그라운드에서 끊임없이 토론합니다.
          </p>
        </div>

        <TopicForm />

        <div className="mt-16">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
              토론 기록
            </h2>
            <div className="flex gap-3 text-xs text-white/30">
              <span>🟢 찬성</span>
              <span>🔴 반대</span>
              <span>🔵 중립</span>
            </div>
          </div>
          <DebateList />
        </div>
      </div>
    </main>
  );
}
