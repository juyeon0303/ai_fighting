export type DebateStatus = "active" | "paused" | "ended";
export type ReportStatus = "none" | "generating" | "done";
export type LlmMode = "free" | "user_api";
export type ApiProvider = "openai" | "gemini";
export type ApiLayout = "openai_only" | "gemini_only" | "gpt_vs_gemini";

export type PersonaId = "atlas" | "cipher" | "ember";

/** 토론 메시지 화자 — AI 셋 + 중재하는 사용자(신) */
export type MessageSpeakerId = PersonaId | "god";

export type MessageLlmSource = "openai" | "gemini" | "engine";

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
  personaId: MessageSpeakerId;
  content: string;
  round: number;
  createdAt: string;
  /** 어떤 모델이 생성했는지 (없으면 예전 메시지) */
  llmSource?: MessageLlmSource | null;
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
  emberArguments: string[];
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
  tokenSaveMode: boolean;
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
