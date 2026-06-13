export type DebateStatus = "active" | "paused" | "ended";
export type ReportStatus = "none" | "generating" | "done";

export type PersonaId = "pro" | "con" | "neutral" | "moderator";

export type TimelineEventType = "consensus" | "turning_point" | "conflict";

export interface Persona {
  id: PersonaId;
  name: string;
  role: string;
  color: string;
  emoji: string;
}

export interface DebateMessage {
  id: string;
  debateId: string;
  personaId: PersonaId;
  content: string;
  round: number;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  debateId: string;
  type: TimelineEventType;
  title: string;
  summary: string;
  round: number;
  messageId: string | null;
  createdAt: string;
}

export interface DebateReport {
  debateId: string;
  title: string;
  executiveSummary: string;
  consensusPoints: string[];
  proArguments: string[];
  conArguments: string[];
  unresolvedIssues: string[];
  finalConclusion: string;
  recommendation: string;
  generatedAt: string;
}

export interface Debate {
  id: string;
  topic: string;
  status: DebateStatus;
  round: number;
  maxRounds: number;
  turnIntervalMs: number;
  lastTurnAt: string | null;
  reportStatus: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DebateWithMessages extends Debate {
  messages: DebateMessage[];
  timeline: TimelineEvent[];
  report: DebateReport | null;
}
