"use client";

import type { DebateMessage } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";

const CLASH_KEYWORDS = ["반박", "틀렸", "동의할 수 없", "아닙니다", "문제", "위험"];

function isClashMessage(message: DebateMessage, prev?: DebateMessage): boolean {
  if (!prev) return false;
  const isOpposing =
    (prev.personaId === "pro" && message.personaId === "con") ||
    (prev.personaId === "con" && message.personaId === "pro");
  if (!isOpposing) return false;
  return CLASH_KEYWORDS.some((k) => message.content.includes(k));
}

interface MessageBubbleProps {
  message: DebateMessage;
  prevMessage?: DebateMessage;
  isNew?: boolean;
}

export function MessageBubble({ message, prevMessage, isNew }: MessageBubbleProps) {
  const persona = PERSONAS[message.personaId];
  const clash = isClashMessage(message, prevMessage);
  const slideFrom =
    message.personaId === "pro"
      ? "msg-slide-right"
      : message.personaId === "con"
        ? "msg-slide-left"
        : "";

  return (
    <div
      className={`flex gap-3 ${isNew ? "msg-enter" : ""} ${slideFrom} ${clash ? "msg-clash" : ""}`}
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
          <span className="text-xs text-white/30">라운드 {message.round}</span>
          {clash && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-400">
              격돌
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
    ? PERSONAS[personaId as keyof typeof PERSONAS]?.color ?? "#8b5cf6"
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
      다음 AI가 발언 준비 중...
    </div>
  );
}
