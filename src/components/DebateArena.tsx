"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ApiLayout,
  DebateMessage,
  DebateReport,
  PersonaId,
  TimelineEvent,
} from "@/lib/types";
import { parseTopic, getModeLabel } from "@/lib/topic-context";
import {
  DEBATE_TURN_ORDER,
  normalizePersonaId,
} from "@/lib/personas";
import {
  layoutLabel,
  providerLabel,
} from "@/lib/debate-llm-config";
import { ArenaEffects } from "./ArenaEffects";
import { RoundTablePanel } from "./RoundTablePanel";
import { DebateTimeline } from "./DebateTimeline";
import { DebateReportPanel } from "./DebateReportPanel";
import { DeleteDebateButton } from "./DeleteDebateButton";
import { MessageBubble, TypingIndicator } from "./MessageBubble";

interface DebateArenaProps {
  debateId: string;
}

export function DebateArena({ debateId }: DebateArenaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const knownMessageIds = useRef(new Set<string>());

  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [report, setReport] = useState<DebateReport | null>(null);
  const [reportStatus, setReportStatus] = useState("none");
  const [status, setStatus] = useState("active");
  const [topic, setTopic] = useState("");
  const [llmMode, setLlmMode] = useState<"free" | "user_api">("free");
  const [apiLayout, setApiLayout] = useState<ApiLayout | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [maxTokenBudget, setMaxTokenBudget] = useState(0);
  const [tokenSaveMode, setTokenSaveMode] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [apiConnectionIssue, setApiConnectionIssue] = useState<
    "key_decrypt_failed" | "key_missing" | null
  >(null);
  const [connected, setConnected] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [isClash, setIsClash] = useState(false);
  const [highlightTimelineId, setHighlightTimelineId] = useState<string | null>(
    null,
  );
  const [showReport, setShowReport] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());

  const lastPersonaId = messages.length
    ? messages[messages.length - 1].personaId
    : null;

  useEffect(() => {
    const es = new EventSource(`/api/debates/${debateId}/stream`);

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      setMessages(data.messages);
      setTimeline(data.timeline ?? []);
      setReport(data.report ?? null);
      setReportStatus(data.debate.reportStatus ?? "none");
      setStatus(data.debate.status);
      setTopic(data.debate.topic);
      setLlmMode(data.debate.llmMode ?? "free");
      setApiLayout(data.debate.apiLayout ?? null);
      setTokensUsed(data.debate.tokensUsed ?? 0);
      setMaxTokenBudget(data.debate.maxTokenBudget ?? 0);
      setTokenSaveMode(data.debate.tokenSaveMode ?? false);
      setEndReason(data.debate.endReason ?? null);
      setApiConnectionIssue(data.debate.apiConnectionIssue ?? null);
      setConnected(true);
      data.messages.forEach((m: DebateMessage) =>
        knownMessageIds.current.add(m.id),
      );
      if (data.report) setShowReport(true);
    });

    es.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data) as DebateMessage;
      const isNew = !knownMessageIds.current.has(msg.id);
      knownMessageIds.current.add(msg.id);

      if (isNew) {
        setMessages((prev) => {
          const prevMsg = prev[prev.length - 1];
          const clash =
            prevMsg &&
            prevMsg.personaId !== msg.personaId &&
            /반박|틀렸|아닌데|근데/.test(msg.content);
          if (clash) {
            setIsClash(true);
            setTimeout(() => setIsClash(false), 600);
          }
          return [...prev, msg];
        });

        setNewMessageIds((prev) => new Set(prev).add(msg.id));
        setFlashKey((k) => k + 1);

        setTimeout(() => {
          setNewMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
        }, 800);
      }
    });

    es.addEventListener("timeline", (e) => {
      const event = JSON.parse(e.data) as TimelineEvent;
      setTimeline((prev) => [...prev, event]);
      setHighlightTimelineId(event.id);
      setTimeout(() => setHighlightTimelineId(null), 2000);
    });

    es.addEventListener("report-status", (e) => {
      const data = JSON.parse(e.data);
      setReportStatus(data.reportStatus);
      if (data.reportStatus === "generating") setShowReport(true);
    });

    es.addEventListener("report", (e) => {
      const r = JSON.parse(e.data) as DebateReport;
      setReport(r);
      setReportStatus("done");
      setShowReport(true);
    });

    es.addEventListener("debate-update", (e) => {
      const data = JSON.parse(e.data);
      if (data.debate) {
        setLlmMode(data.debate.llmMode ?? "free");
        setApiLayout(data.debate.apiLayout ?? null);
        setTokensUsed(data.debate.tokensUsed ?? 0);
        setMaxTokenBudget(data.debate.maxTokenBudget ?? 0);
        setTokenSaveMode(data.debate.tokenSaveMode ?? false);
        setEndReason(data.debate.endReason ?? null);
        setApiConnectionIssue(data.debate.apiConnectionIssue ?? null);
        setStatus(data.debate.status);
      }
    });

    es.addEventListener("ended", () => {
      setStatus("ended");
    });

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [debateId]);

  useEffect(() => {
    if (messages.length > 0 || status !== "active") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/debates/${debateId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages?.length) {
          setMessages(data.messages);
          data.messages.forEach((m: DebateMessage) =>
            knownMessageIds.current.add(m.id),
          );
        }
        if (data.status) setStatus(data.status);
        if (data.tokensUsed != null) setTokensUsed(data.tokensUsed);
      } catch {
        /* ignore */
      }
    };

    const id = setInterval(poll, 3000);
    poll();
    return () => clearInterval(id);
  }, [debateId, messages.length, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function toggleStatus(newStatus: "active" | "paused" | "ended") {
    await fetch(`/api/debates/${debateId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatus(newStatus);
    if (newStatus === "ended") setShowReport(true);
  }

  const nextPersona: PersonaId | undefined = (() => {
    if (status !== "active") return undefined;
    return DEBATE_TURN_ORDER[messages.length % DEBATE_TURN_ORDER.length];
  })();

  const topicCtx = topic ? parseTopic(topic) : null;

  const sourceStats = messages.reduce(
    (acc, m) => {
      if (m.llmSource === "gemini") acc.gemini += 1;
      else if (m.llmSource === "openai") acc.openai += 1;
      else if (m.llmSource === "engine") acc.engine += 1;
      return acc;
    },
    { gemini: 0, openai: 0, engine: 0 },
  );
  const trackedSources =
    sourceStats.gemini + sourceStats.openai + sourceStats.engine;

  return (
    <div className="relative flex h-full flex-col">
      <header className="relative z-10 shrink-0 border-b border-white/8 px-6 py-4">
        <div className="relative flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-white">{topic}</h1>
            {topicCtx && (
              <p className="mt-1 text-xs text-white/35">
                [{getModeLabel(topicCtx.mode)}] {topicCtx.brief}
              </p>
            )}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/40">
                <span
                  className={`inline-flex items-center gap-1.5 ${connected ? "text-emerald-400" : "text-white/30"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-white/30"}`}
                  />
                  {connected ? "실시간 연결" : "연결 끊김"}
                </span>
                <span>·</span>
                <span>
                  {status === "active"
                    ? "🔥 토론 진행 중"
                    : status === "paused"
                      ? "⏸ 일시정지"
                      : "✅ 토론 종료"}
                </span>
                {timeline.length > 0 && (
                  <>
                    <span>·</span>
                    <span>합의 {timeline.filter((e) => e.type === "consensus").length}건</span>
                  </>
                )}
                {tokenSaveMode && (
                  <>
                    <span>·</span>
                    <span className="text-cyan-400/90">절약 모드</span>
                  </>
                )}
                {llmMode === "user_api" && maxTokenBudget > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      {layoutLabel(apiLayout)} · 토큰{" "}
                      {tokensUsed.toLocaleString()} /{" "}
                      {maxTokenBudget.toLocaleString()}
                      {trackedSources > 0 && (
                        <span className="text-white/45">
                          {" "}
                          · Gemini {sourceStats.gemini} · GPT {sourceStats.openai}
                          {sourceStats.engine > 0 && (
                            <span className="text-amber-400/90">
                              {" "}
                              · 엔진 {sourceStats.engine}
                            </span>
                          )}
                        </span>
                      )}
                      {tokensUsed === 0 && messages.length > 0 && status === "active" && (
                        <span className="text-amber-400/90">
                          {" "}
                          ·{" "}
                          {apiConnectionIssue === "key_decrypt_failed"
                            ? "API 키 복호화 실패 — 토론 삭제 후 새로 만들기"
                            : apiConnectionIssue === "key_missing"
                              ? "API 키 없음 — 새 토론에서 키 다시 입력"
                              : "API 응답 대기 중"}
                        </span>
                      )}
                    </span>
                  </>
                )}
                {endReason && (
                  <>
                    <span>·</span>
                    <span>
                      {endReason === "token_budget"
                        ? "토큰 예산 종료"
                        : endReason === "api_quota"
                          ? "API 한도 종료"
                          : endReason === "invalid_api_key"
                            ? "API 키 오류"
                            : endReason === "empty_turn"
                              ? "응답 생성 실패"
                              : endReason === "max_rounds"
                                ? "토론 길이 한도"
                                : endReason}
                    </span>
                  </>
                )}
                {process.env.NEXT_PUBLIC_BUILD_SHA &&
                  process.env.NEXT_PUBLIC_BUILD_SHA !== "local" && (
                    <>
                      <span>·</span>
                      <span className="text-white/22">
                        build {process.env.NEXT_PUBLIC_BUILD_SHA.slice(0, 7)}
                      </span>
                    </>
                  )}
              </div>
            </div>
            <div className="flex gap-2">
              {(report || reportStatus === "generating") && (
                <button
                  onClick={() => setShowReport(true)}
                  className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-500/20"
                >
                  📋 보고서
                </button>
              )}
              {status === "active" && (
                <button
                  onClick={() => toggleStatus("paused")}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/5"
                >
                  일시정지
                </button>
              )}
              {status === "paused" && (
                <button
                  onClick={() => toggleStatus("active")}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white transition hover:bg-violet-500"
                >
                  재개
                </button>
              )}
              {status !== "ended" && (
                <button
                  onClick={() => toggleStatus("ended")}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
                >
                  종료
                </button>
              )}
              <DeleteDebateButton
                debateId={debateId}
                topic={topic || "이 토론"}
                redirectHome
              />
            </div>
          </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <RoundTablePanel
          topic={topic}
          messageCount={messages.length}
          lastPersonaId={lastPersonaId}
          nextPersona={nextPersona}
          status={status}
          llmMode={llmMode}
          apiLayout={apiLayout}
        />

        <section className="relative flex min-w-0 flex-1 flex-col border-r border-white/6">
          <ArenaEffects
            lastPersonaId={lastPersonaId}
            flashKey={flashKey}
            isClash={isClash}
          />
          <div className="flex shrink-0 items-center justify-between border-b border-white/6 px-5 py-2.5">
            <p className="text-xs font-medium text-white/50">실시간 토론</p>
            <p className="text-[10px] text-white/30">
              {messages.length > 0 ? `${messages.length}개 발언` : "대기 중"}
            </p>
          </div>
          <div className="relative flex-1 overflow-y-auto px-5 py-5">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-white/30">
                천재 3명이 원탁에 앉는 중...
              </div>
            )}
            <div className="mx-auto max-w-2xl space-y-0">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  prevMessage={messages[i - 1]}
                  isNew={newMessageIds.has(msg.id)}
                />
              ))}
              {status === "active" && messages.length > 0 && (
                <TypingIndicator personaId={nextPersona} />
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        </section>

        <DebateTimeline events={timeline} highlightId={highlightTimelineId} />
      </div>

      <DebateReportPanel
        report={report}
        reportStatus={reportStatus}
        visible={showReport}
        onClose={() => setShowReport(false)}
        apiLayout={apiLayout}
      />
    </div>
  );
}
