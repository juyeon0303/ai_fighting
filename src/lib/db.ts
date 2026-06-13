import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import type {
  Debate,
  DebateMessage,
  DebateReport,
  DebateStatus,
  ReportStatus,
  TimelineEvent,
} from "./types";

interface Database {
  debates: Debate[];
  messages: DebateMessage[];
  timelineEvents: TimelineEvent[];
  reports: DebateReport[];
}

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "debates.json");

function ensureDb(): Database {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(DB_PATH)) {
    const empty: Database = {
      debates: [],
      messages: [],
      timelineEvents: [],
      reports: [],
    };
    writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), "utf-8");
    return empty;
  }

  const raw = JSON.parse(readFileSync(DB_PATH, "utf-8")) as Partial<Database>;
  return {
    debates: (raw.debates ?? []).map(normalizeDebate),
    messages: raw.messages ?? [],
    timelineEvents: raw.timelineEvents ?? [],
    reports: raw.reports ?? [],
  };
}

function normalizeDebate(debate: Debate): Debate {
  return {
    ...debate,
    reportStatus: debate.reportStatus ?? "none",
  };
}

function saveDb(db: Database): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function listDebates(): Debate[] {
  const db = ensureDb();
  return db.debates.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getDebate(id: string): Debate | null {
  const db = ensureDb();
  return db.debates.find((d) => d.id === id) ?? null;
}

export function getDebateMessages(debateId: string): DebateMessage[] {
  const db = ensureDb();
  return db.messages
    .filter((m) => m.debateId === debateId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export function getTimelineEvents(debateId: string): TimelineEvent[] {
  const db = ensureDb();
  return db.timelineEvents
    .filter((e) => e.debateId === debateId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export function getDebateReport(debateId: string): DebateReport | null {
  const db = ensureDb();
  return db.reports.find((r) => r.debateId === debateId) ?? null;
}

export function createDebate(
  topic: string,
  options?: { maxRounds?: number; turnIntervalMs?: number },
): Debate {
  const db = ensureDb();
  const now = new Date().toISOString();

  const debate: Debate = {
    id: uuidv4(),
    topic: topic.trim(),
    status: "active",
    round: 0,
    maxRounds: options?.maxRounds ?? 20,
    turnIntervalMs: options?.turnIntervalMs ?? 8000,
    lastTurnAt: null,
    reportStatus: "none",
    createdAt: now,
    updatedAt: now,
  };

  db.debates.push(debate);
  saveDb(db);
  return debate;
}

export function addMessage(
  debateId: string,
  personaId: DebateMessage["personaId"],
  content: string,
  round: number,
): DebateMessage {
  const db = ensureDb();
  const now = new Date().toISOString();

  const message: DebateMessage = {
    id: uuidv4(),
    debateId,
    personaId,
    content,
    round,
    createdAt: now,
  };

  db.messages.push(message);

  const debate = db.debates.find((d) => d.id === debateId);
  if (debate) {
    debate.round = round;
    debate.lastTurnAt = now;
    debate.updatedAt = now;
  }

  saveDb(db);
  return message;
}

export function addTimelineEvent(
  event: Omit<TimelineEvent, "id" | "createdAt">,
): TimelineEvent {
  const db = ensureDb();
  const now = new Date().toISOString();

  const timelineEvent: TimelineEvent = {
    ...event,
    id: uuidv4(),
    createdAt: now,
  };

  db.timelineEvents.push(timelineEvent);

  const debate = db.debates.find((d) => d.id === event.debateId);
  if (debate) {
    debate.updatedAt = now;
  }

  saveDb(db);
  return timelineEvent;
}

export function updateDebateStatus(
  id: string,
  status: DebateStatus,
): Debate | null {
  const db = ensureDb();
  const debate = db.debates.find((d) => d.id === id);
  if (!debate) return null;

  debate.status = status;
  debate.updatedAt = new Date().toISOString();
  saveDb(db);
  return debate;
}

export function updateReportStatus(
  id: string,
  reportStatus: ReportStatus,
): Debate | null {
  const db = ensureDb();
  const debate = db.debates.find((d) => d.id === id);
  if (!debate) return null;

  debate.reportStatus = reportStatus;
  debate.updatedAt = new Date().toISOString();
  saveDb(db);
  return debate;
}

export function saveDebateReport(report: DebateReport): DebateReport {
  const db = ensureDb();
  const index = db.reports.findIndex((r) => r.debateId === report.debateId);

  if (index >= 0) {
    db.reports[index] = report;
  } else {
    db.reports.push(report);
  }

  const debate = db.debates.find((d) => d.id === report.debateId);
  if (debate) {
    debate.reportStatus = "done";
    debate.updatedAt = new Date().toISOString();
  }

  saveDb(db);
  return report;
}

export function getActiveDebates(): Debate[] {
  const db = ensureDb();
  return db.debates.filter((d) => d.status === "active");
}

export function hasTimelineForRound(debateId: string, round: number): boolean {
  const db = ensureDb();
  return db.timelineEvents.some(
    (e) => e.debateId === debateId && e.round === round,
  );
}
