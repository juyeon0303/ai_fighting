"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ApiLayout,
  DebateMessage,
  DebateReport,
  TimelineEvent,
} from "@/lib/types";
import { parseTopic, getModeLabel } from "@/lib/topic-context";
import { lastPersonaId as resolveLastPersonaId } from "@/lib/personas";
import {
  layoutLabel,
  providerLabel,
  isTokenBudgetLow,
  MIN_TURN_TOKEN_RESERVE,
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
  const tokenAlertShown = useRef(false);

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
  const [godInput, setGodInput] = useState("");
  const [godSending, setGodSending] = useState(false);

  const lastPersonaId = resolveLastPersonaId(messages);

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

    es.addEventListener("ended", (e) => {
      const data = JSON.parse(e.data) as { endReason?: string | null };
      setStatus("ended");
      if (data.endReason) setEndReason(data.endReason);
      if (
        data.endReason === "token_budget" &&
        !tokenAlertShown.current
      ) {
        tokenAlertShown.current = true;
        alert("토큰이 부족합니다");
      }
    });

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [debateId]);

  useEffect(() => {
    if (messages.length > 0 || status !== "active") return;

    const bootstrap = async () => {
      try {
        const res = await fetch(`/api/debates/${debateId}/kick`, {
          method: "POST",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messageCount?: number;
          status?: string;
          endReason?: string | null;
          tokensUsed?: number;
          debate?: {
            apiConnectionIssue?: typeof apiConnectionIssue;
          };
        };

        if (data.debate?.apiConnectionIssue) {
          setApiConnectionIssue(data.debate.apiConnectionIssue);
        }
        if (data.status) setStatus(data.status);
        if (data.endReason) setEndReason(data.endReason);
        if (data.tokensUsed != null) setTokensUsed(data.tokensUsed);

        if ((data.messageCount ?? 0) > 0) {
          const full = await fetch(`/api/debates/${debateId}`);
          if (!full.ok) return;
          const fullData = await full.json();
          if (fullData.messages?.length) {
            setMessages(fullData.messages);
            fullData.messages.forEach((m: DebateMessage) =>
              knownMessageIds.current.add(m.id),
            );
          }
        }
      } catch {
        /* ignore */
      }
    };

    bootstrap();
    const id = setInterval(bootstrap, 4000);
    return () => clearInterval(id);
  }, [debateId, messages.length, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (llmMode !== "user_api" || maxTokenBudget <= 0) return;

    const reserve = Math.max(MIN_TURN_TOKEN_RESERVE, 580);
    const low =
      endReason === "token_budget" ||
      isTokenBudgetLow(tokensUsed, maxTokenBudget, reserve);

    if (!low || tokenAlertShown.current) return;

    tokenAlertShown.current = true;
    alert("토큰이 부족합니다");
  }, [llmMode, maxTokenBudget, tokensUsed, endReason, status]);

  async function toggleStatus(newStatus: "active" | "paused" | "ended") {
    await fetch(`/api/debates/${debateId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatus(newStatus);
    if (newStatus === "ended") setShowReport(true);
  }

  async function sendGodIntervention() {
    const text = godInput.trim();
    if (!text || godSending || status !== "active") return;
    setGodSending(true);
    try {
      const res = await fetch(`/api/debates/${debateId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        setGodInput("");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "전달하지 못했습니다.");
      }
    } catch {
      alert("전달하지 못했습니다.");
    } finally {
      setGodSending(false);
    }
  }

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
      <header className="relative z-10 shrink-0 border-b border-[var(--brand-gold)]/10 px-6 py-4">
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
                  className={`inline-flex items-center gap-1.5 ${connected ? "text-[var(--brand-jade)]" : "text-white/30"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-[var(--brand-jade)]" : "bg-white/30"}`}
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
                    <span className="text-[var(--brand-jade)]/90">절약 모드</span>
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
                      {tokensUsed === 0 && status === "active" && (
                        <span className="text-amber-400/90">
                          {" "}
                          ·{" "}
                          {apiConnectionIssue === "key_decrypt_failed"
                            ? "API 키 복호화 실패 — 새 토론에서 키 다시 입력"
                            : apiConnectionIssue === "key_missing"
                              ? "API 키 없음 — 새 토론에서 키 다시 입력"
                              : messages.length === 0
                                ? "첫 발언 생성 중…"
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
                          : endReason === "api_rate_limit"
                            ? "API 호출 제한 (일시)"
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
                  className="rounded-lg border border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/10 px-3 py-1.5 text-xs text-[var(--brand-gold-light)] transition hover:bg-[var(--brand-gold)]/20"
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
                  className="jsg-btn-primary rounded-lg px-3 py-1.5 text-xs"
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
          status={status}
          llmMode={llmMode}
          apiLayout={apiLayout}
          conversationLive={status === "active" && messages.length > 0}
        />

        <section className="relative flex min-w-0 flex-1 flex-col border-r border-[var(--brand-gold)]/8">
          <ArenaEffects
            lastPersonaId={lastPersonaId}
            flashKey={flashKey}
            isClash={isClash}
          />
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--brand-gold)]/8 px-5 py-2.5">
            <p className="text-xs font-medium text-[var(--brand-gold)]/55">실시간 대화</p>
            <p className="text-[10px] text-white/30">
              {messages.length > 0 ? `${messages.length}개 발언` : "대기 중"}
            </p>
          </div>
          <div className="relative flex-1 overflow-y-auto px-5 py-5">
            {messages.length === 0 && status === "active" && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
                {apiConnectionIssue ? (
                  <p className="text-center text-amber-400/90">
                    {apiConnectionIssue === "key_decrypt_failed"
                      ? "API 키를 복호화하지 못했습니다. Render의 API_KEY_ENCRYPTION_SECRET 확인 후 새 토론을 만들어 주세요."
                      : "API 키가 저장되지 않았습니다. 홈에서 키를 다시 입력해 새 토론을 시작해 주세요."}
                  </p>
                ) : (
                  <>
                    <TypingIndicator />
                    <p className="text-[var(--brand-gold)]/45">
                      자·강·세가 원탁에 앉는 중...
                    </p>
                  </>
                )}
              </div>
            )}
            {messages.length === 0 && status !== "active" && (
              <div className="flex h-full items-center justify-center text-sm text-[var(--brand-gold)]/35">
                발언이 없습니다
              </div>
            )}
            <div className="mx-auto max-w-2xl space-y-3">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  prevMessage={messages[i - 1]}
                  isNew={newMessageIds.has(msg.id)}
                />
              ))}
              {status === "active" && messages.length > 0 && (
                <TypingIndicator />
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          {status === "active" && (
            <div className="shrink-0 border-t border-amber-300/15 bg-amber-400/[0.04] px-5 py-3">
              <div className="mx-auto max-w-2xl">
                <div className="mb-2 flex items-center gap-2 text-xs text-amber-200/80">
                  <span className="font-semibold text-amber-100">신</span>
                  <span className="text-white/35">· 토론 중 태클·방향 조정</span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={godInput}
                    onChange={(e) => setGodInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendGodIntervention();
                      }
                    }}
                    placeholder='예: "주제 벗어났어, 페이커·쵸비로 다시" / "강 너무 억지야"'
                    rows={2}
                    maxLength={400}
                    disabled={godSending}
                    className="min-h-[52px] flex-1 resize-none rounded-lg border border-amber-300/20 bg-black/30 px-3 py-2 text-[13px] text-white/90 placeholder:text-white/30 focus:border-amber-300/40 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void sendGodIntervention()}
                    disabled={godSending || !godInput.trim()}
                    className="shrink-0 self-end rounded-lg border border-amber-300/30 bg-amber-400/15 px-4 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {godSending ? "전달 중…" : "전달"}
                  </button>
                </div>
              </div>
            </div>
          )}
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
