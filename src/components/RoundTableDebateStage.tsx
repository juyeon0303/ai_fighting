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
      className={`debate-bubble relative rounded-xl px-3 py-2 text-[12px] leading-relaxed text-white/88 ${isNew ? "msg-enter" : ""} ${spark ? "msg-clash" : ""}`}
      style={{
        backgroundColor: `${persona.color}20`,
        border: `1px solid ${persona.color}40`,
      }}
    >
      <p>{message.content}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-[9px] text-white/28">
          {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {spark && (
          <span className="rounded-full bg-violet-500/20 px-1 py-0.5 text-[8px] text-violet-300">
            반박
          </span>
        )}
      </div>
    </div>
  );
}

function RoundTable({
  topic,
  waiting,
}: {
  topic: string;
  waiting: boolean;
}) {
  return (
    <div className="round-table-wrap relative flex shrink-0 items-center justify-center">
      {/* 바닥 그림자 */}
      <div
        className="absolute left-1/2 top-[88%] h-3 w-[92%] -translate-x-1/2 rounded-[50%] bg-black/40 blur-md"
        aria-hidden
      />
      {/* 테이블 가장자리(두꺼운 원형 테두리) */}
      <div className="round-table-rim relative flex h-[7.5rem] w-[7.5rem] items-center justify-center rounded-full p-[7px] shadow-[0_8px_32px_rgba(0,0,0,0.45)] sm:h-[8.5rem] sm:w-[8.5rem]">
        {/* 상판 */}
        <div className="round-table-surface relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full px-2 text-center">
          {waiting ? (
            <p className="text-[10px] leading-snug text-amber-100/50">
              원형
              <br />
              토론탁
            </p>
          ) : (
            <>
              <p className="text-[8px] font-semibold uppercase tracking-widest text-amber-200/40">
                주제
              </p>
              <p className="mt-0.5 line-clamp-3 text-[10px] font-medium leading-snug text-amber-50/80 sm:text-[11px]">
                {topic}
              </p>
            </>
          )}
        </div>
        {/* 의자 3개 — 탁 가장자리 */}
        {[0, 120, 240].map((deg) => (
          <span
            key={deg}
            className="round-table-chair absolute h-2.5 w-4 rounded-sm bg-gradient-to-b from-zinc-500/80 to-zinc-800/90 shadow-sm"
            style={{
              transform: `rotate(${deg}deg) translateY(-3.75rem)`,
              transformOrigin: "center 3.75rem",
            }}
            aria-hidden
          />
        ))}
      </div>
      <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tracking-wide text-amber-200/35">
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
      className={`debate-seat flex shrink-0 flex-col items-center transition-transform duration-300 ${isActive ? "debate-seat-active scale-105" : ""}`}
    >
      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-lg sm:h-12 sm:w-12 sm:text-xl"
        style={{
          backgroundColor: `${meta.color}30`,
          border: `2px solid ${isActive ? meta.color : `${meta.color}55`}`,
          boxShadow: isActive ? `0 0 20px ${meta.color}44` : undefined,
        }}
      >
        {meta.emoji}
        {isActive && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        )}
      </div>
      <p className="mt-1 text-xs font-bold" style={{ color: meta.color }}>
        {name}
      </p>
      <p className="text-[9px] text-white/35">{geniusLens(personaId)}</p>
      {llmMode === "user_api" && apiLayout && (
        <p className="text-[8px] text-white/25">{providerLabel(provider)}</p>
      )}
    </div>
  );
}

interface RoundTableDebateStageProps {
  messages: DebateMessage[];
  newMessageIds: Set<string>;
  nextPersona?: PersonaId;
  lastPersonaId: string | null;
  status: string;
  topic: string;
  llmMode: "free" | "user_api";
  apiLayout: ApiLayout | null;
}

export function RoundTableDebateStage({
  messages,
  newMessageIds,
  nextPersona,
  lastPersonaId,
  status,
  topic,
  llmMode,
  apiLayout,
}: RoundTableDebateStageProps) {
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

  function seatProps(personaId: PersonaId) {
    const provider =
      llmMode === "user_api" && apiLayout
        ? personaProvider(apiLayout, personaId)
        : "gemini";
    const isSpeaking =
      status === "active" &&
      normalizePersonaId(lastPersonaId ?? "") === personaId;
    const isNext =
      status === "active" && nextPersona === personaId && messages.length > 0;
    return {
      provider,
      name: personaDisplayName(personaId, provider),
      personaMessages: messagesByPersona[personaId],
      isActive: isSpeaking || isNext,
      isNext,
    };
  }

  function BubbleStack({
    personaId,
    align,
  }: {
    personaId: PersonaId;
    align: "center" | "end" | "start";
  }) {
    const { personaMessages, isNext } = seatProps(personaId);
    const alignClass =
      align === "center"
        ? "items-center"
        : align === "end"
          ? "items-end"
          : "items-start";

    return (
      <div
        className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-0.5 ${alignClass}`}
        style={{ flexDirection: "column-reverse" }}
      >
        {isNext && <TypingIndicator personaId={personaId} compact />}
        {[...personaMessages].reverse().map((msg) => (
          <SeatBubble
            key={msg.id}
            message={msg}
            spark={isSparkMessage(msg, prevById.get(msg.id))}
            isNew={newMessageIds.has(msg.id)}
          />
        ))}
      </div>
    );
  }

  const ge = seatProps("atlas");
  const mi = seatProps("cipher");
  const ni = seatProps("ember");

  return (
    <div className="round-table-stage mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-1 p-2 sm:p-3">
      {/* GE — 위쪽, 말풍선 넓게 */}
      <div className="flex min-h-0 flex-[1.1] flex-col items-center">
        <BubbleStack personaId="atlas" align="center" />
        <div className="mt-1 shrink-0">
          <SeatBadge
            personaId="atlas"
            name={ge.name}
            provider={ge.provider}
            llmMode={llmMode}
            apiLayout={apiLayout}
            isActive={ge.isActive}
          />
        </div>
      </div>

      {/* MI · 원형탁 · NI */}
      <div className="grid min-h-0 flex-[1.35] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1 sm:gap-2">
        <div className="flex h-full min-h-0 flex-col items-end pr-0.5 sm:pr-1">
          <BubbleStack personaId="cipher" align="end" />
          <div className="mt-1 shrink-0">
            <SeatBadge
              personaId="cipher"
              name={mi.name}
              provider={mi.provider}
              llmMode={llmMode}
              apiLayout={apiLayout}
              isActive={mi.isActive}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center justify-end pb-6 sm:pb-8">
          <RoundTable topic={topic} waiting={messages.length === 0} />
        </div>

        <div className="flex h-full min-h-0 flex-col items-start pl-0.5 sm:pl-1">
          <BubbleStack personaId="ember" align="start" />
          <div className="mt-1 shrink-0">
            <SeatBadge
              personaId="ember"
              name={ni.name}
              provider={ni.provider}
              llmMode={llmMode}
              apiLayout={apiLayout}
              isActive={ni.isActive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
