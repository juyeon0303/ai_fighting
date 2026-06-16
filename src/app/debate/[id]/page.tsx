import Link from "next/link";
import { DebateArena } from "@/components/DebateArena";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";

export default async function DebatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="jsg-page flex h-screen flex-col">
      <nav className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--brand-gold)]/10 bg-[var(--brand-ink)]/80 px-5 py-3 backdrop-blur-sm sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <span className="brand-mark flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brand-gold)]/25 bg-[var(--brand-gold)]/8 text-sm text-[var(--brand-gold)]">
            天
          </span>
          <span>
            <span className="brand-title text-base">{SITE_NAME}</span>
            <span className="mt-0.5 block text-[10px] tracking-[0.2em] text-[var(--brand-gold)]/40">
              {SITE_TAGLINE}
            </span>
          </span>
        </Link>
        <p className="hidden text-[11px] text-[var(--brand-paper)]/35 sm:block">
          창을 닫아도 원탁 토론은 계속됩니다
        </p>
      </nav>
      <div className="flex-1 overflow-hidden">
        <DebateArena debateId={id} />
      </div>
    </main>
  );
}
