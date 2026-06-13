export type DebateStatus = "active" | "paused" | "ended";
export type ReportStatus = "none" | "generating" | "done";
export type LlmMode = "free" | "user_api";
export type ApiProvider = "openai" | "gemini";
export type ApiLayout = "openai_only" | "gemini_only" | "gpt_vs_gemini";

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
  llmMode: LlmMode;
  apiLayout: ApiLayout | null;
  apiProvider: ApiProvider | null;
  apiModel: string | null;
  openaiModel: string | null;
  geminiModel: string | null;
  maxTokenBudget: number;
  tokensUsed: number;
  endReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** 서버 전용 — API 응답에서는 제거 */
  encryptedApiKey?: string | null;
  encryptedGeminiKey?: string | null;
}

export interface DebateWithMessages extends Debate {
  messages: DebateMessage[];
  timeline: TimelineEvent[];
  report: DebateReport | null;
}
