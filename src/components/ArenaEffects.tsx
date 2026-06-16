"use client";

import { PERSONA_META, normalizePersonaId } from "@/lib/personas";

interface ArenaEffectsProps {
  lastPersonaId: string | null;
  flashKey: number;
  isClash: boolean;
}

export function ArenaEffects({
  lastPersonaId,
  flashKey,
  isClash,
}: ArenaEffectsProps) {
  const color = lastPersonaId
    ? PERSONA_META[normalizePersonaId(lastPersonaId)].color
    : "#8b5cf6";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse at 50% 55%, ${color}14 0%, transparent 55%)`,
        }}
      />
      {flashKey > 0 && (
        <div
          key={flashKey}
          className="arena-flash absolute inset-0"
          style={{ background: `${color}08` }}
        />
      )}
      {isClash && (
        <div key={`clash-${flashKey}`} className="arena-clash absolute inset-0" />
      )}
    </div>
  );
}
