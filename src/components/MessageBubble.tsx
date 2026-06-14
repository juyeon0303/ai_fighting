"use client";

import type { DebateMessage } from "@/lib/types";
import { getPersona, normalizePersonaId, PERSONA_META, providerFromMessageSource } from "@/lib/personas";

const SPARK_KEYWORDS = ["반박", "틀렸", "아닌데", "그건", "근데", "다르게"];

function isSparkMessage(message: DebateMessage, prev?: DebateMessage): boolean {
  if (!prev) return false;
  if (prev.personaId === message.personaId) return false;
  return SPARK_KEYWORDS.some((k) => message.content.includes(k));
}

interface MessageBubbleProps {
  message: DebateMessage;
  prevMessage?: DebateMessage;
  isNew?: boolean;
}

export function MessageBubble({ message, prevMessage, isNew }: MessageBubbleProps) {
  const pid = normalizePersonaId(message.personaId);
  const provider = providerFromMessageSource(message.llmSource);
  const persona = getPersona(pid, provider);
  const spark = isSparkMessage(message, prevMessage);
  const slideFrom =
    pid === "atlas"
      ? "msg-slide-right"
      : pid === "cipher"
        ? "msg-slide-left"
        : "";

  return (
    <div
      className={`flex gap-3 ${isNew ? "msg-enter" : ""} ${slideFrom} ${spark ? "msg-clash" : ""}`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition-transform ${isNew ? "avatar-pop" : ""}`}
        style={{ backgroundColor: `${persona.color}22` }}
      >
        {persona.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: persona.color }}>
            {persona.name}
          </span>
          <span className="text-xs text-white/30">{persona.role}</span>
          <span className="text-xs text-white/30">라운드 {message.round}</span>
          {message.llmSource && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                message.llmSource === "gemini"
                  ? "bg-sky-500/15 text-sky-300"
                  : message.llmSource === "openai"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {message.llmSource === "gemini"
                ? "Gemini"
                : message.llmSource === "openai"
                  ? "GPT"
                  : "엔진"}
            </span>
          )}
          {spark && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
              반응
            </span>
          )}
        </div>
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-white/85"
          style={{
            backgroundColor: `${persona.color}15`,
            borderLeft: `3px solid ${persona.color}`,
          }}
        >
          {message.content}
        </div>
        <p className="mt-1 text-xs text-white/20">
          {new Date(message.createdAt).toLocaleTimeString("ko-KR")}
        </p>
      </div>
    </div>
  );
}

interface TypingIndicatorProps {
  personaId?: string;
}

export function TypingIndicator({ personaId }: TypingIndicatorProps) {
  const color = personaId
    ? PERSONA_META[normalizePersonaId(personaId)].color
    : "#8b5cf6";

  return (
    <div className="flex items-center gap-2 text-sm text-white/30">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full"
            style={{ backgroundColor: color, animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      다음 천재가 말 준비 중...
    </div>
  );
}
