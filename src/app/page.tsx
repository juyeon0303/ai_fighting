import { TopicForm } from "@/components/TopicForm";
import { DebateList } from "@/components/DebateList";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0c0a14]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg px-5 py-10 sm:py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            AI 끝장토론
          </h1>
          <p className="mt-1.5 text-sm text-white/40">
            GE · MI · NI가 주제를 놓고 대화합니다.
          </p>
        </header>

        <TopicForm />

        <section className="mt-10">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/30">
            토론 기록
          </h2>
          <DebateList />
        </section>
      </div>
    </main>
  );
}
