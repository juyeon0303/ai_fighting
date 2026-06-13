import { EventEmitter } from "events";
import { analyzeRoundForTimeline, generateFinalReport } from "./analysis";
import {
  addMessage,
  addTimelineEvent,
  addTokenUsage,
  getActiveDebates,
  getDebate,
  getDebateMessages,
  getDebateReport,
  getTimelineEvents,
  hasTimelineForRound,
  saveDebateReport,
  setDebateEndReason,
  updateDebateStatus,
  updateReportStatus,
} from "./db";
import {
  isTokenBudgetExceeded,
  resolveDebateAnalysisOptions,
  resolvePersonaLlmRuntime,
} from "./debate-llm-config";
import { generateDebateTurn, generateEngineTurn } from "./llm";
import { getNextPersona, TURNS_PER_ROUND } from "./personas";
import type { DebateMessage } from "./types";

export const debateEvents = new EventEmitter();
debateEvents.setMaxListeners(100);

const turnInflight = new Map<string, Promise<DebateMessage | null>>();
const finalizing = new Set<string>();
let workerStarted = false;
let workerTimer: ReturnType<typeof setInterval> | null = null;

async function analyzeRound(
  debateId: string,
  round: number,
): Promise<void> {
  if (await hasTimelineForRound(debateId, round)) return;

  const debate = await getDebate(debateId);
  if (!debate) return;

  const messages = await getDebateMessages(debateId);
  const analysisOpts = resolveDebateAnalysisOptions(debate!);
  const eventData = await analyzeRoundForTimeline(
    debate!.topic,
    messages,
    round,
    analysisOpts ?? undefined,
  );

  if (!eventData) return;

  const event = await addTimelineEvent(eventData);
  debateEvents.emit("timeline", { debateId, event });
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
    const timeline = await getTimelineEvents(debateId);
    const analysisOpts = resolveDebateAnalysisOptions(debate);

    const reportData = await generateFinalReport(
      debate.topic,
      messages,
      timeline,
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
  if (endReason) {
    await setDebateEndReason(debateId, endReason);
  }
  await updateDebateStatus(debateId, "ended");
  debateEvents.emit("debate-ended", { debateId });
  await finalizeDebate(debateId);
}

async function processDebateTurnInner(
  debateId: string,
): Promise<DebateMessage | null> {
  try {
    const debate = await getDebate(debateId);
    if (!debate || debate.status !== "active") return null;

    if (isTokenBudgetExceeded(debate)) {
      await endDebate(debateId, "token_budget");
      return null;
    }

    const messages = await getDebateMessages(debateId);
    const messageCountAtStart = messages.length;
    const round = Math.floor(messageCountAtStart / TURNS_PER_ROUND) + 1;

    if (round > debate.maxRounds) {
      await endDebate(debateId, "max_rounds");
      return null;
    }

    const personaId = getNextPersona(round, messageCountAtStart);
    const runtime = resolvePersonaLlmRuntime(debate, personaId);
    let turn = await generateDebateTurn(
      debate.topic,
      personaId,
      messages,
      round,
      debateId,
      runtime,
    );

    if (!turn.content?.trim()) {
      turn = await generateEngineTurn(
        debate.topic,
        personaId,
        messages,
        round,
        debateId,
      );
    }

    if (turn.source === "engine" && debate.llmMode === "user_api") {
      console.warn(
        `[debate ${debateId}] API unavailable — engine fallback (${personaId})`,
      );
    }

    if (!turn.content?.trim()) {
      await endDebate(debateId, "empty_turn");
      return null;
    }

    const latest = await getDebateMessages(debateId);
    if (latest.length !== messageCountAtStart) {
      console.warn(
        `[debate ${debateId}] stale turn skipped (${messageCountAtStart} → ${latest.length})`,
      );
      return null;
    }

    const expectedPersona = getNextPersona(
      Math.floor(messageCountAtStart / TURNS_PER_ROUND) + 1,
      messageCountAtStart,
    );
    if (expectedPersona !== personaId) {
      return null;
    }

    if (turn.tokensUsed > 0) {
      const updated = await addTokenUsage(debateId, turn.tokensUsed);
      if (updated && isTokenBudgetExceeded(updated)) {
        const message = await addMessage(
          debateId,
          personaId,
          turn.content,
          round,
        );
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

    const message = await addMessage(
      debateId,
      personaId,
      turn.content,
      round,
    );
    debateEvents.emit("message", { debateId, message });

    const freshDebate = await getDebate(debateId);
    if (freshDebate) {
      debateEvents.emit("debate-update", {
        debateId,
        debate: freshDebate,
      });
    }

    const updatedMessages = await getDebateMessages(debateId);
    if (updatedMessages.length % TURNS_PER_ROUND === 0) {
      analyzeRound(debateId, round).catch(console.error);
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
  const inflight = turnInflight.get(debateId);
  if (inflight) return inflight;

  const promise = processDebateTurnInner(debateId);
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
    const messages = await getDebateMessages(debate.id);

    if (messages.length === 0) {
      await processDebateTurn(debate.id);
      continue;
    }

    const now = Date.now();
    const lastAt = debate.lastTurnAt ?? messages[messages.length - 1].createdAt;
    const elapsed = now - new Date(lastAt).getTime();
    if (elapsed < debate.turnIntervalMs) continue;

    await processDebateTurn(debate.id);
  }
}

export function startDebateWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  workerTimer = setInterval(() => {
    tick().catch(console.error);
  }, 1000);

  tick().catch(console.error);
}

export function stopDebateWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  workerStarted = false;
}

export async function backfillTimeline(debateId: string): Promise<void> {
  const debate = await getDebate(debateId);
  if (!debate) return;

  const messages = await getDebateMessages(debateId);
  const completedRounds = Math.floor(messages.length / TURNS_PER_ROUND);

  for (let round = 1; round <= completedRounds; round++) {
    if (await hasTimelineForRound(debateId, round)) continue;
    await analyzeRound(debateId, round);
  }
}

export async function kickstartDebate(debateId: string): Promise<void> {
  startDebateWorker();
  await backfillTimeline(debateId);
  await processDebateTurn(debateId);
}

export async function manualEndDebate(debateId: string): Promise<void> {
  const debate = await getDebate(debateId);
  if (!debate || debate.status === "ended") return;
  await endDebate(debateId);
}
