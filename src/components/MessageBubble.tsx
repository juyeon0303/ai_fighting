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
  sameSpeakerTwice?: boolean;
}

export function MessageBubble({
  message,
  prevMessage,
  isNew,
  sameSpeakerTwice,
}: MessageBubbleProps) {
  const pid = normalizePersonaId(message.personaId);
  const provider = providerFromMessageSource(message.llmSource);
  const persona = getPersona(pid, provider);
  const spark = isSparkMessage(message, prevMessage);
  const time = new Date(message.createdAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      className={`border-b border-white/[0.06] pb-4 last:border-b-0 ${isNew ? "msg-enter" : ""} ${spark ? "msg-clash" : ""}`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm ${isNew ? "avatar-pop" : ""}`}
          style={{ backgroundColor: `${persona.color}22` }}
        >
          {persona.emoji}
        </span>
        <span className="text-sm font-semibold" style={{ color: persona.color }}>
          {persona.name}
        </span>
        <span className="text-[11px] text-white/28">{persona.role}</span>
        <span className="text-[11px] text-white/22">{time}</span>
        {message.llmSource && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              message.llmSource === "gemini"
                ? "bg-sky-500/10 text-sky-300/80"
                : message.llmSource === "openai"
                  ? "bg-emerald-500/10 text-emerald-300/80"
                  : "bg-amber-500/10 text-amber-300/80"
            }`}
          >
            {message.llmSource === "gemini"
              ? "Gemini"
              : message.llmSource === "openai"
                ? "GPT"
                : "엔진"}
          </span>
        )}
        {sameSpeakerTwice && (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300/80">
            순서 오류
          </span>
        )}
        {spark && (
          <span className="rounded bg-[var(--brand-gold)]/10 px-1.5 py-0.5 text-[10px] text-[var(--brand-gold-light)]/80">
            반응
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-white/82">
        {message.content}
      </p>
    </article>
  );
}

interface TypingIndicatorProps {
  personaId?: string;
  compact?: boolean;
}

export function TypingIndicator({ personaId, compact }: TypingIndicatorProps) {
  const pid = personaId ? normalizePersonaId(personaId) : "cipher";
  const color = PERSONA_META[pid].color;
  const name = personaId
    ? getPersona(pid, "gemini").name
    : null;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-white/50"
        style={{ borderColor: `${color}33` }}
      >
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 w-1 animate-bounce rounded-full"
              style={{ backgroundColor: color, animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        {name} 생각 중...
      </div>
    );
  }

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
      {name ? `${name} 생각 중...` : "다음 발언 준비 중..."}
    </div>
  );
}
