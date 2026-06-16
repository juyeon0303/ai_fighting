"use client";

import type { ApiLayout, DebateMessage, PersonaId } from "@/lib/types";
import {
  DEBATE_TURN_ORDER,
  PERSONA_META,
  geniusLens,
  getPersona,
  normalizePersonaId,
  personaDisplayName,
  providerFromMessageSource,
} from "@/lib/personas";
import { personaProvider, providerLabel } from "@/lib/debate-llm-config";
import { TypingIndicator } from "./MessageBubble";

const SPARK_KEYWORDS = ["반박", "틀렸", "아닌데", "그건", "근데", "다르게"];

/** 삼각형 꼭짓점 — GE 위, MI 왼쪽 아래, NI 오른쪽 아래 */
const SEAT_LAYOUT: Record<
  PersonaId,
  { left: string; top: string; bubbleMaxW: string }
> = {
  atlas: { left: "50%", top: "14%", bubbleMaxW: "min(280px, 34vw)" },
  cipher: { left: "16%", top: "78%", bubbleMaxW: "min(260px, 32vw)" },
  ember: { left: "84%", top: "78%", bubbleMaxW: "min(260px, 32vw)" },
};

function isSparkMessage(message: DebateMessage, prev?: DebateMessage): boolean {
  if (!prev) return false;
  if (normalizePersonaId(prev.personaId) !== normalizePersonaId(message.personaId)) {
    return SPARK_KEYWORDS.some((k) => message.content.includes(k));
  }
  return false;
}

function SeatBubble({
  message,
  spark,
  isNew,
}: {
  message: DebateMessage;
  spark: boolean;
  isNew: boolean;
}) {
  const pid = normalizePersonaId(message.personaId);
  const persona = getPersona(pid, providerFromMessageSource(message.llmSource));

  return (
    <div
      className={`debate-bubble relative rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed text-white/88 shadow-lg ${isNew ? "msg-enter" : ""} ${spark ? "msg-clash" : ""}`}
      style={{
        backgroundColor: `${persona.color}22`,
        border: `1px solid ${persona.color}44`,
        boxShadow: `0 8px 32px ${persona.color}18`,
      }}
    >
      <p>{message.content}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-white/30">
          {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {spark && (
          <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] text-violet-300">
            반박
          </span>
        )}
      </div>
      <span
        className="debate-bubble-tail absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent"
        style={{ borderTopColor: `${persona.color}33` }}
        aria-hidden
      />
    </div>
  );
}

interface TriangleDebateStageProps {
  messages: DebateMessage[];
  newMessageIds: Set<string>;
  nextPersona?: PersonaId;
  lastPersonaId: string | null;
  status: string;
  topic: string;
  llmMode: "free" | "user_api";
  apiLayout: ApiLayout | null;
}

export function TriangleDebateStage({
  messages,
  newMessageIds,
  nextPersona,
  lastPersonaId,
  status,
  topic,
  llmMode,
  apiLayout,
}: TriangleDebateStageProps) {
  const messagesByPersona = DEBATE_TURN_ORDER.reduce(
    (acc, id) => {
      acc[id] = messages.filter(
        (m) => normalizePersonaId(m.personaId) === id,
      );
      return acc;
    },
    {} as Record<PersonaId, DebateMessage[]>,
  );

  const prevById = new Map<string, DebateMessage | undefined>();
  messages.forEach((m, i) => prevById.set(m.id, messages[i - 1]));

  return (
    <div className="triangle-stage relative mx-auto h-full min-h-[520px] w-full max-w-5xl px-4 py-6">
      {/* 삼각형 테이블 */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="table-surface" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(139,92,246,0.12)" />
            <stop offset="50%" stopColor="rgba(30,27,46,0.6)" />
            <stop offset="100%" stopColor="rgba(6,182,212,0.1)" />
          </linearGradient>
        </defs>
        <polygon
          points="50,18 14,82 86,82"
          fill="url(#table-surface)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.4"
        />
        <polygon
          points="50,18 14,82 86,82"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1.2"
          strokeDasharray="2 1.5"
        />
      </svg>

      {/* 중앙 주제 */}
      <div className="pointer-events-none absolute left-1/2 top-[48%] z-0 max-w-[200px] -translate-x-1/2 -translate-y-1/2 text-center">
        {messages.length === 0 ? (
          <p className="text-sm text-white/35">천재 3명이 자리에 앉는 중...</p>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-white/30">
              토론 주제
            </p>
            <p className="mt-1 line-clamp-3 text-sm font-medium text-white/75">
              {topic}
            </p>
          </div>
        )}
      </div>

      {/* 3석 */}
      {DEBATE_TURN_ORDER.map((personaId) => {
        const layout = SEAT_LAYOUT[personaId];
        const meta = PERSONA_META[personaId];
        const provider =
          llmMode === "user_api" && apiLayout
            ? personaProvider(apiLayout, personaId)
            : "gemini";
        const name = personaDisplayName(personaId, provider);
        const personaMessages = messagesByPersona[personaId];
        const isSpeaking =
          status === "active" &&
          normalizePersonaId(lastPersonaId ?? "") === personaId;
        const isNext =
          status === "active" && nextPersona === personaId && messages.length > 0;
        const isActive = isSpeaking || isNext;

        return (
          <div
            key={personaId}
            className="absolute z-10 flex flex-col items-center"
            style={{
              left: layout.left,
              top: layout.top,
              transform: "translate(-50%, -50%)",
              width: layout.bubbleMaxW,
            }}
          >
            {/* 말풍선 스택 (좌석 위) */}
            <div
              className="mb-3 flex max-h-[min(42vh,320px)] w-full flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1"
              style={{ flexDirection: "column-reverse" }}
            >
              {isNext && (
                <div className="flex justify-center py-1">
                  <TypingIndicator personaId={personaId} compact />
                </div>
              )}
              {[...personaMessages].reverse().map((msg) => (
                <SeatBubble
                  key={msg.id}
                  message={msg}
                  spark={isSparkMessage(msg, prevById.get(msg.id))}
                  isNew={newMessageIds.has(msg.id)}
                />
              ))}
            </div>

            {/* 좌석 */}
            <div
              className={`debate-seat flex flex-col items-center transition-all duration-300 ${isActive ? "debate-seat-active" : ""}`}
            >
              <div
                className={`relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-2xl transition-all ${isActive ? "scale-110" : "scale-100"}`}
                style={{
                  backgroundColor: `${meta.color}28`,
                  border: `2px solid ${isActive ? meta.color : `${meta.color}66`}`,
                  boxShadow: isActive
                    ? `0 0 28px ${meta.color}55, 0 0 0 4px ${meta.color}18`
                    : `0 4px 20px ${meta.color}22`,
                }}
              >
                {meta.emoji}
                {isActive && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                )}
              </div>
              <div
                className="mt-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-center backdrop-blur-md"
                style={{ borderColor: `${meta.color}33` }}
              >
                <p
                  className="text-sm font-bold"
                  style={{ color: meta.color }}
                >
                  {name}
                </p>
                <p className="text-[10px] text-white/40">{geniusLens(personaId)}</p>
                {llmMode === "user_api" && apiLayout && (
                  <p className="mt-0.5 text-[9px] text-white/30">
                    {providerLabel(provider)}
                  </p>
                )}
              </div>
              <div
                className="mt-1 h-2 w-14 rounded-full opacity-60"
                style={{
                  background: `linear-gradient(180deg, ${meta.color}44, ${meta.color}11)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
