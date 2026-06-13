import Link from "next/link";
import { DebateArena } from "@/components/DebateArena";

export default async function DebatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="flex h-screen flex-col bg-[#0c0a14]">
      <nav className="flex shrink-0 items-center gap-4 border-b border-white/8 px-6 py-3">
        <Link
          href="/"
          className="text-sm text-white/40 transition hover:text-white"
        >
          ← 홈으로
        </Link>
        <span className="text-white/20">|</span>
        <span className="text-xs text-white/30">백그라운드 토론 진행 중 — 창을 닫아도 계속됩니다</span>
      </nav>
      <div className="flex-1 overflow-hidden">
        <DebateArena debateId={id} />
      </div>
    </main>
  );
}
