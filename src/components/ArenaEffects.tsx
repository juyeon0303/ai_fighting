"use client";

import type { PersonaId } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";

interface ArenaEffectsProps {
  lastPersonaId: PersonaId | null;
  flashKey: number;
  isClash: boolean;
}

export function ArenaEffects({
  lastPersonaId,
  flashKey,
  isClash,
}: ArenaEffectsProps) {
  const color = lastPersonaId ? PERSONAS[lastPersonaId].color : "#8b5cf6";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${color}18 0%, transparent 60%)`,
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
