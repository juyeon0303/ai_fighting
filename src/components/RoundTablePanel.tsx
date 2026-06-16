"use client";

import type { ApiLayout, PersonaId } from "@/lib/types";
import {
  DEBATE_TURN_ORDER,
  PERSONA_META,
  geniusLens,
  normalizePersonaId,
  personaDisplayName,
} from "@/lib/personas";
import { personaProvider, providerLabel } from "@/lib/debate-llm-config";

/** 원탁 주변 좌석 — 120° 간격, GE 위 / MI 왼아래 / NI 오른아래 */
const SEAT_ANGLES: Record<PersonaId, number> = {
  atlas: 270,
  cipher: 150,
  ember: 30,
};

/** 테이블 반지름 + 좌석 간격 (px) — GE(위쪽)는 시각적으로 더 붙게 */
const ORBIT_PX: Record<PersonaId, number> = {
  atlas: 102,
  cipher: 118,
  ember: 118,
};

function RoundTable({
  topic,
  waiting,
  sizeClass = "h-[11.5rem] w-[11.5rem] sm:h-[12.5rem] sm:w-[12.5rem]",
}: {
  topic: string;
  waiting: boolean;
  sizeClass?: string;
}) {
  const chairRadius = 112;

  return (
    <div className="round-table-wrap relative flex shrink-0 items-center justify-center">
      <div
        className="absolute left-1/2 top-[90%] h-4 w-[95%] -translate-x-1/2 rounded-[50%] bg-black/45 blur-lg"
        aria-hidden
      />
      <div
        className={`round-table-rim relative flex ${sizeClass} items-center justify-center rounded-full p-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)]`}
      >
        <div className="round-table-surface relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full px-3 text-center">
          {waiting ? (
            <p className="text-[11px] leading-snug text-amber-100/55">
              원형
              <br />
              토론탁
            </p>
          ) : (
            <>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-200/45">
                주제
              </p>
              <p className="mt-1 line-clamp-4 text-[11px] font-medium leading-snug text-amber-50/85 sm:text-xs">
                {topic}
              </p>
            </>
          )}
        </div>
        {[0, 120, 240].map((deg) => (
          <span
            key={deg}
            className="round-table-chair absolute h-3 w-5 rounded-sm bg-gradient-to-b from-zinc-400/90 to-zinc-800 shadow-md"
            style={{
              transform: `rotate(${deg}deg) translateY(-${chairRadius}px)`,
              transformOrigin: `center ${chairRadius}px`,
            }}
            aria-hidden
          />
        ))}
      </div>
      <p className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tracking-[0.2em] text-amber-200/40">
        ROUND TABLE
      </p>
    </div>
  );
}

function SeatBadge({
  personaId,
  name,
  provider,
  llmMode,
  apiLayout,
  isActive,
}: {
  personaId: PersonaId;
  name: string;
  provider: "gemini" | "openai";
  llmMode: "free" | "user_api";
  apiLayout: ApiLayout | null;
  isActive: boolean;
}) {
  const meta = PERSONA_META[personaId];
  return (
    <div
      className={`debate-seat flex flex-col items-center transition-transform duration-300 ${isActive ? "debate-seat-active scale-105" : ""}`}
    >
      <div
        className="relative flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-lg"
        style={{
          backgroundColor: `${meta.color}35`,
          border: `2px solid ${isActive ? meta.color : `${meta.color}66`}`,
          boxShadow: isActive ? `0 0 24px ${meta.color}55` : undefined,
        }}
      >
        {meta.emoji}
        {isActive && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full ring-2 ring-black/40"
            style={{ backgroundColor: meta.color }}
          />
        )}
      </div>
      <p className="mt-1.5 text-xs font-bold" style={{ color: meta.color }}>
        {name}
      </p>
      <p className="max-w-[4.5rem] truncate text-center text-[9px] text-white/40">
        {geniusLens(personaId)}
      </p>
      {llmMode === "user_api" && apiLayout && (
        <p className="text-[8px] text-white/28">{providerLabel(provider)}</p>
      )}
    </div>
  );
}

interface RoundTablePanelProps {
  topic: string;
  messageCount: number;
  lastPersonaId: string | null;
  nextPersona?: PersonaId;
  status: string;
  llmMode: "free" | "user_api";
  apiLayout: ApiLayout | null;
}

export function RoundTablePanel({
  topic,
  messageCount,
  lastPersonaId,
  nextPersona,
  status,
  llmMode,
  apiLayout,
}: RoundTablePanelProps) {
  return (
    <aside className="round-table-panel flex h-full w-[min(100%,20rem)] shrink-0 flex-col border-r border-white/8 bg-black/15 sm:w-[22rem]">
      <div className="border-b border-white/6 px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/35">
          토론석
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div
          className="relative"
          style={{ width: 300, height: 300 }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <RoundTable topic={topic} waiting={messageCount === 0} />
          </div>

          {DEBATE_TURN_ORDER.map((personaId) => {
            const angle = SEAT_ANGLES[personaId];
            const orbit = ORBIT_PX[personaId];
            const rad = (angle * Math.PI) / 180;
            const x = Math.cos(rad) * orbit;
            const y = Math.sin(rad) * orbit + (personaId === "atlas" ? 6 : 0);
            const provider =
              llmMode === "user_api" && apiLayout
                ? personaProvider(apiLayout, personaId)
                : "gemini";
            const isSpeaking =
              status === "active" &&
              normalizePersonaId(lastPersonaId ?? "") === personaId;
            const isNext =
              status === "active" &&
              nextPersona === personaId &&
              messageCount > 0;

            return (
              <div
                key={personaId}
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                }}
              >
                <SeatBadge
                  personaId={personaId}
                  name={personaDisplayName(personaId, provider)}
                  provider={provider}
                  llmMode={llmMode}
                  apiLayout={apiLayout}
                  isActive={isSpeaking || isNext}
                />
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
