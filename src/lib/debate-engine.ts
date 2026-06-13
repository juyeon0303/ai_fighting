import { EventEmitter } from "events";
import { analyzeRoundForTimeline, generateFinalReport } from "./analysis";
import {
  addMessage,
  addTimelineEvent,
  getActiveDebates,
  getDebate,
  getDebateMessages,
  getDebateReport,
  getTimelineEvents,
  hasTimelineForRound,
  saveDebateReport,
  updateDebateStatus,
  updateReportStatus,
} from "./db";
import { generateDebateTurn } from "./llm";
import { getNextPersona } from "./personas";
import type { DebateMessage } from "./types";

export const debateEvents = new EventEmitter();
debateEvents.setMaxListeners(100);

const processing = new Set<string>();
const finalizing = new Set<string>();
let workerStarted = false;
let workerTimer: ReturnType<typeof setInterval> | null = null;

async function analyzeRound(
  debateId: string,
  round: number,
): Promise<void> {
  if (hasTimelineForRound(debateId, round)) return;

  const debate = getDebate(debateId);
  if (!debate) return;

  const messages = getDebateMessages(debateId);
  const eventData = await analyzeRoundForTimeline(
    debate.topic,
    messages,
    round,
  );

  if (!eventData) return;

  const event = addTimelineEvent(eventData);
  debateEvents.emit("timeline", { debateId, event });
}

export async function finalizeDebate(debateId: string): Promise<void> {
  if (finalizing.has(debateId)) return;

  const existing = getDebateReport(debateId);
  if (existing) {
    debateEvents.emit("report", { debateId, report: existing });
    return;
  }

  finalizing.add(debateId);

  try {
    const debate = getDebate(debateId);
    if (!debate) return;

    updateReportStatus(debateId, "generating");
    debateEvents.emit("report-status", {
      debateId,
      reportStatus: "generating",
    });

    const messages = getDebateMessages(debateId);
    const timeline = getTimelineEvents(debateId);

    const reportData = await generateFinalReport(
      debate.topic,
      messages,
      timeline,
    );

    const report = saveDebateReport({
      ...reportData,
      debateId,
      generatedAt: new Date().toISOString(),
    });

    debateEvents.emit("report", { debateId, report });
  } finally {
    finalizing.delete(debateId);
  }
}

async function endDebate(debateId: string): Promise<void> {
  updateDebateStatus(debateId, "ended");
  debateEvents.emit("debate-ended", { debateId });
  await finalizeDebate(debateId);
}

async function processDebateTurn(debateId: string): Promise<DebateMessage | null> {
  if (processing.has(debateId)) return null;
  processing.add(debateId);

  try {
    const debate = getDebate(debateId);
    if (!debate || debate.status !== "active") return null;

    const messages = getDebateMessages(debateId);
    const round = Math.floor(messages.length / 4) + 1;

    if (round > debate.maxRounds) {
      await endDebate(debateId);
      return null;
    }

    const personaId = getNextPersona(round, messages.length);
    const content = await generateDebateTurn(
      debate.topic,
      personaId,
      messages,
      round,
    );

    const message = addMessage(debateId, personaId, content, round);
    debateEvents.emit("message", { debateId, message });

    const updatedMessages = getDebateMessages(debateId);
    if (updatedMessages.length % 4 === 0) {
      analyzeRound(debateId, round).catch(console.error);
    }

    return message;
  } finally {
    processing.delete(debateId);
  }
}

async function tick(): Promise<void> {
  const activeDebates = getActiveDebates();

  for (const debate of activeDebates) {
    const messages = getDebateMessages(debate.id);
    const now = Date.now();

    if (messages.length === 0) continue;

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
  }, 2000);

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
  const debate = getDebate(debateId);
  if (!debate || debate.status === "ended") return;
  await endDebate(debateId);
}
