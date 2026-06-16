import { EventEmitter } from "events";
import { generateFinalReport } from "./analysis";
import {
  addMessage,
  tryAddMessage,
  addTokenUsage,
  getActiveDebates,
  getDebate,
  getDebateMessages,
  getDebateReport,
  saveDebateReport,
  setDebateEndReason,
  updateDebateStatus,
  updateReportStatus,
} from "./db";
import {
  isTokenBudgetExceeded,
  isTokenBudgetInsufficient,
  minTokenReserveForDebate,
  resolveDebateAnalysisOptions,
  resolvePersonaLlmRuntime,
} from "./debate-llm-config";
import { generateDebateTurn } from "./llm";
import {
  isTurnComplete,
} from "./debate-turn-budget";
import {
  effectiveTurnIntervalMs,
  enforceNextSpeaker,
  GOD_SPEAKER_ID,
  isGodSpeaker,
  normalizePersonaId,
  pickNextSpeaker,
  TURNS_PER_ROUND,
  WORKER_TICK_MS,
} from "./personas";
import type { DebateMessage } from "./types";

export const debateEvents = new EventEmitter();
debateEvents.setMaxListeners(100);

const turnInflight = new Map<string, Promise<DebateMessage | null>>();
const emptyTurnStreak = new Map<string, number>();
const rateLimitStreak = new Map<string, number>();
const rateLimitBackoffUntil = new Map<string, number>();
const finalizing = new Set<string>();
const scheduledTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
let workerStarted = false;
let workerTimer: ReturnType<typeof setInterval> | null = null;

function scheduleNextTurn(debateId: string, delayMs: number): void {
  const prev = scheduledTurnTimers.get(debateId);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    scheduledTurnTimers.delete(debateId);
    getDebate(debateId)
      .then((d) => {
        if (d?.status === "active") {
          processDebateTurn(debateId).catch(console.error);
        }
      })
      .catch(console.error);
  }, Math.max(300, delayMs));

  scheduledTurnTimers.set(debateId, timer);
}

async function planNextTurn(debateId: string): Promise<void> {
  const debate = await getDebate(debateId);
  if (!debate || debate.status !== "active") return;

  const messages = await getDebateMessages(debateId);
  if (messages.length >= debate.maxRounds * TURNS_PER_ROUND) return;

  const backoffUntil = rateLimitBackoffUntil.get(debateId);
  let delay = effectiveTurnIntervalMs(debate.turnIntervalMs);

  if (backoffUntil && Date.now() < backoffUntil) {
    delay = backoffUntil - Date.now() + 200;
  } else {
    const emptyStreak = emptyTurnStreak.get(debateId) ?? 0;
    if (emptyStreak > 0) {
      delay = Math.max(delay, 1200 + emptyStreak * 700);
    }
  }

  scheduleNextTurn(debateId, delay);
}

export async function finalizeDebate(debateId: string): Promise<void> {
  if (finalizing.has(debateId)) return;

  const existing = await getDebateReport(debateId);
  if (existing) {
    debateEvents.emit("report", { debateId, report: existing });
    return;
  }

  finalizing.add(debateId);

  try {
    const debate = await getDebate(debateId);
    if (!debate) return;

    await updateReportStatus(debateId, "generating");
    debateEvents.emit("report-status", {
      debateId,
      reportStatus: "generating",
    });

    const messages = await getDebateMessages(debateId);
    const analysisOpts = resolveDebateAnalysisOptions(debate);

    const reportData = await generateFinalReport(
      debate.topic,
      messages,
      {
        endReason: debate.endReason,
        ...analysisOpts,
      },
    );

    const report = await saveDebateReport({
      ...reportData,
      debateId,
      generatedAt: new Date().toISOString(),
    });

    debateEvents.emit("report", { debateId, report });
  } finally {
    finalizing.delete(debateId);
  }
}

async function endDebate(debateId: string, endReason?: string): Promise<void> {
  const pending = scheduledTurnTimers.get(debateId);
  if (pending) {
    clearTimeout(pending);
    scheduledTurnTimers.delete(debateId);
  }
  if (endReason) {
    await setDebateEndReason(debateId, endReason);
  }
  await updateDebateStatus(debateId, "ended");
  const debate = await getDebate(debateId);
  if (debate) {
    debateEvents.emit("debate-update", { debateId, debate });
  }
  debateEvents.emit("debate-ended", { debateId, endReason: endReason ?? null });
  await finalizeDebate(debateId);
}

async function processDebateTurnInner(
  debateId: string,
): Promise<DebateMessage | null> {
  try {
    const debate = await getDebate(debateId);
    if (!debate || debate.status !== "active") return null;

    if (isTokenBudgetInsufficient(debate)) {
      await endDebate(debateId, "token_budget");
      return null;
    }

    const messages = await getDebateMessages(debateId);
    const messageCountAtStart = messages.length;
    const round = Math.floor(messageCountAtStart / TURNS_PER_ROUND) + 1;

    if (messageCountAtStart >= debate.maxRounds * TURNS_PER_ROUND) {
      await endDebate(debateId, "max_rounds");
      return null;
    }

    const personaId = enforceNextSpeaker(
      messages,
      pickNextSpeaker(messages, debateId),
    );

    const runtime = resolvePersonaLlmRuntime(debate, personaId);
    if (!runtime.apiKey) {
      console.warn(`[debate ${debateId}] missing API key for ${personaId}`);
      await endDebate(debateId, "invalid_api_key");
      return null;
    }

    const turn = await generateDebateTurn(
      debate.topic,
      personaId,
      messages,
      round,
      debateId,
      runtime,
    );

    if (turn.stopReason === "auth") {
      await endDebate(debateId, "invalid_api_key");
      return null;
    }
    if (turn.stopReason === "quota") {
      await endDebate(debateId, "api_quota");
      return null;
    }
    if (turn.stopReason === "rate_limit") {
      const streak = (rateLimitStreak.get(debateId) ?? 0) + 1;
      rateLimitStreak.set(debateId, streak);
      const delayMs = Math.min(60_000, Math.round(2000 * 1.45 ** (streak - 1)));
      rateLimitBackoffUntil.set(debateId, Date.now() + delayMs);
      console.warn(
        `[debate ${debateId}] Gemini rate limited — retry in ${delayMs}ms (${streak})`,
      );
      return null;
    }
    if (turn.stopReason === "missing_key") {
      await endDebate(debateId, "invalid_api_key");
      return null;
    }

    if (!turn.content?.trim() || !isTurnComplete(turn.content)) {
      const streak = (emptyTurnStreak.get(debateId) ?? 0) + 1;
      emptyTurnStreak.set(debateId, streak);
      console.warn(
        `[debate ${debateId}] empty/incomplete turn (${personaId}) — retry later (${streak}/5)`,
      );
      const remaining = debate.maxTokenBudget - debate.tokensUsed;
      const reserve = minTokenReserveForDebate(debate);
      if (
        streak >= 2 &&
        debate.maxTokenBudget > 0 &&
        remaining < reserve * 2
      ) {
        emptyTurnStreak.delete(debateId);
        await endDebate(debateId, "token_budget");
        return null;
      }
      if (streak >= 5) {
        emptyTurnStreak.delete(debateId);
        await endDebate(debateId, "empty_turn");
      }
      return null;
    }

    emptyTurnStreak.delete(debateId);
    rateLimitStreak.delete(debateId);
    rateLimitBackoffUntil.delete(debateId);

    const latest = await getDebateMessages(debateId);
    if (latest.length !== messageCountAtStart) {
      console.warn(
        `[debate ${debateId}] stale turn skipped (${messageCountAtStart} → ${latest.length})`,
      );
      return null;
    }

    if (latest.length > 0) {
      const last = latest[latest.length - 1]!;
      if (!isGodSpeaker(last.personaId)) {
        const lastSpeaker = normalizePersonaId(last.personaId);
        if (lastSpeaker === personaId) {
          console.warn(
            `[debate ${debateId}] blocked back-to-back speaker (${personaId})`,
          );
          return null;
        }
      }
    }

    if (turn.tokensUsed > 0) {
      const updated = await addTokenUsage(debateId, turn.tokensUsed);
      if (updated && isTokenBudgetExceeded(updated)) {
        const message = await tryAddMessage(
          debateId,
          personaId,
          turn.content,
          round,
          turn.source,
          messageCountAtStart,
        );
        if (!message) return null;
        debateEvents.emit("message", { debateId, message });
        const freshDebate = await getDebate(debateId);
        if (freshDebate) {
          debateEvents.emit("debate-update", {
            debateId,
            debate: freshDebate,
          });
        }
        await endDebate(debateId, "token_budget");
        return message;
      }
    }

    const message = await tryAddMessage(
      debateId,
      personaId,
      turn.content,
      round,
      turn.source,
      messageCountAtStart,
    );
    if (!message) {
      console.warn(
        `[debate ${debateId}] message save rejected (slot race ${personaId})`,
      );
      return null;
    }
    debateEvents.emit("message", { debateId, message });

    const freshDebate = await getDebate(debateId);
    if (freshDebate) {
      debateEvents.emit("debate-update", {
        debateId,
        debate: freshDebate,
      });
    }

    return message;
  } catch (error) {
    console.error(`[debate ${debateId}] turn failed:`, error);
    return null;
  }
}

export async function processDebateTurn(
  debateId: string,
): Promise<DebateMessage | null> {
  startDebateWorker();

  const inflight = turnInflight.get(debateId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      return await processDebateTurnInner(debateId);
    } finally {
      await planNextTurn(debateId);
    }
  })();

  turnInflight.set(debateId, promise);
  try {
    return await promise;
  } finally {
    turnInflight.delete(debateId);
  }
}

async function tick(): Promise<void> {
  const activeDebates = await getActiveDebates();

  for (const debate of activeDebates) {
    const backoffUntil = rateLimitBackoffUntil.get(debate.id);
    if (backoffUntil && Date.now() < backoffUntil) continue;

    const messages = await getDebateMessages(debate.id);

    if (messages.length === 0) {
      await processDebateTurn(debate.id);
      continue;
    }

    const now = Date.now();
    const lastAt = debate.lastTurnAt ?? messages[messages.length - 1].createdAt;
    const elapsed = now - new Date(lastAt).getTime();
    if (elapsed < effectiveTurnIntervalMs(debate.turnIntervalMs)) continue;

    await processDebateTurn(debate.id);
  }
}

export function startDebateWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  workerTimer = setInterval(() => {
    tick().catch(console.error);
  }, WORKER_TICK_MS);

  tick().catch(console.error);
}

export function stopDebateWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  workerStarted = false;
}

export async function kickstartDebate(debateId: string): Promise<void> {
  startDebateWorker();
  await processDebateTurn(debateId);
}

export async function manualEndDebate(debateId: string): Promise<void> {
  const debate = await getDebate(debateId);
  if (!debate || debate.status === "ended") return;
  await endDebate(debateId);
}

const MAX_GOD_INTERVENTION_CHARS = 400;

/** 사용자(신)가 토론 중 개입 — 메시지 저장 후 AI 턴 유도 */
export async function submitGodIntervention(
  debateId: string,
  content: string,
): Promise<DebateMessage | null> {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_GOD_INTERVENTION_CHARS) return null;

  const debate = await getDebate(debateId);
  if (!debate || debate.status !== "active") return null;

  startDebateWorker();

  const messages = await getDebateMessages(debateId);
  const round = Math.floor(messages.length / TURNS_PER_ROUND) + 1;
  const message = await addMessage(
    debateId,
    GOD_SPEAKER_ID,
    trimmed,
    round,
    null,
  );

  debateEvents.emit("message", { debateId, message });

  const freshDebate = await getDebate(debateId);
  if (freshDebate) {
    debateEvents.emit("debate-update", { debateId, debate: freshDebate });
  }

  processDebateTurn(debateId).catch(console.error);
  return message;
}
