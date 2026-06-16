import Link from "next/link";
import { PERSONA_TRIO_LABEL, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/brand";

interface SiteBrandProps {
  compact?: boolean;
  linkHome?: boolean;
  className?: string;
}

export function SiteBrand({
  compact = false,
  linkHome = false,
  className = "",
}: SiteBrandProps) {
  const content = (
    <div className={className}>
      <p className="text-[10px] font-medium tracking-[0.32em] text-[var(--brand-gold)]/55">
        {SITE_TAGLINE}
      </p>
      <h1
        className={`brand-title ${compact ? "text-xl" : "text-3xl sm:text-4xl"} mt-1`}
      >
        {SITE_NAME}
      </h1>
      {!compact && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--brand-paper)]/45">
          {SITE_DESCRIPTION}
        </p>
      )}
      {!compact && (
        <p className="mt-3 inline-flex items-center gap-2 text-[11px] tracking-widest text-[var(--brand-gold)]/40">
          <span className="h-px w-6 bg-[var(--brand-gold)]/25" aria-hidden />
          {PERSONA_TRIO_LABEL}
          <span className="h-px w-6 bg-[var(--brand-gold)]/25" aria-hidden />
        </p>
      )}
    </div>
  );

  if (linkHome) {
    return (
      <Link href="/" className="group block transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}
