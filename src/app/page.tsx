import { TopicForm } from "@/components/TopicForm";
import { DebateList } from "@/components/DebateList";
import { SiteBrand } from "@/components/SiteBrand";

export default function Home() {
  return (
    <main className="jsg-page min-h-screen">
      <div className="jsg-ambient pointer-events-none fixed inset-0 overflow-hidden" />

      <div className="relative mx-auto max-w-lg px-5 py-10 sm:py-14">
        <header className="mb-9">
          <SiteBrand />
        </header>

        <TopicForm />

        <section className="mt-10">
          <h2 className="mb-3 text-[11px] font-medium tracking-[0.2em] text-[var(--brand-gold)]/35">
            기록
          </h2>
          <DebateList />
        </section>
      </div>
    </main>
  );
}
