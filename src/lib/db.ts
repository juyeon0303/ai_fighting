import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { encryptApiKey } from "./api-key-crypto";
import type { UserApiInput } from "./debate-llm-config";
import { validateUserApiInput } from "./debate-llm-config";
import { normalizeGeminiModel } from "./gemini-models";
import { DEFAULT_TURN_INTERVAL_MS } from "./personas";
import { normalizeOpenaiModel } from "./openai-models";
import { getSupabase, isSupabaseEnabled } from "./supabase";
import type {
  Debate,
  DebateMessage,
  DebateReport,
  DebateStatus,
  MessageLlmSource,
  ReportStatus,
  TimelineEvent,
} from "./types";

interface FileDatabase {
  debates: Debate[];
  messages: DebateMessage[];
  timelineEvents: TimelineEvent[];
  reports: DebateReport[];
}

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "debates.json");

// ─── Row mappers (Supabase snake_case → app camelCase) ───

function rowToDebate(row: Record<string, unknown>): Debate {
  const llmMode = (row.llm_mode as Debate["llmMode"]) ?? "free";
  const rawBudget = (row.max_token_budget as number) ?? 0;

  return {
    id: row.id as string,
    topic: row.topic as string,
    status: row.status as DebateStatus,
    round: row.round as number,
    maxRounds: row.max_rounds as number,
    turnIntervalMs: row.turn_interval_ms as number,
    lastTurnAt: (row.last_turn_at as string) ?? null,
    reportStatus: (row.report_status as ReportStatus) ?? "none",
    llmMode,
    apiLayout: (row.api_layout as Debate["apiLayout"]) ?? null,
    apiProvider: (row.api_provider as Debate["apiProvider"]) ?? null,
    apiModel: (row.api_model as string) ?? null,
    openaiModel: (row.openai_model as string) ?? null,
    geminiModel: (row.gemini_model as string) ?? null,
    maxTokenBudget:
      llmMode === "user_api" ? (rawBudget > 0 ? rawBudget : 30_000) : rawBudget,
    tokensUsed: (row.tokens_used as number) ?? 0,
    endReason: (row.end_reason as string) ?? null,
    encryptedApiKey: (row.encrypted_api_key as string) ?? null,
    encryptedGeminiKey: (row.encrypted_gemini_key as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMessage(row: Record<string, unknown>): DebateMessage {
  const llmSource = row.llm_source as DebateMessage["llmSource"];
  return {
    id: row.id as string,
    debateId: row.debate_id as string,
    personaId: row.persona_id as DebateMessage["personaId"],
    content: row.content as string,
    round: row.round as number,
    createdAt: row.created_at as string,
    llmSource: llmSource ?? null,
  };
}

function rowToTimeline(row: Record<string, unknown>): TimelineEvent {
  return {
    id: row.id as string,
    debateId: row.debate_id as string,
    type: row.type as TimelineEvent["type"],
    title: row.title as string,
    summary: row.summary as string,
    round: row.round as number,
    messageId: (row.message_id as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function rowToReport(row: Record<string, unknown>): DebateReport {
  return {
    debateId: row.debate_id as string,
    title: row.title as string,
    executiveSummary: row.executive_summary as string,
    consensusPoints: row.consensus_points as string[],
    proArguments: row.pro_arguments as string[],
    conArguments: row.con_arguments as string[],
    unresolvedIssues: row.unresolved_issues as string[],
    finalConclusion: row.final_conclusion as string,
    recommendation: row.recommendation as string,
    generatedAt: row.generated_at as string,
  };
}

// ─── File DB (로컬 폴백) ───

function ensureFileDb(): FileDatabase {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  if (!existsSync(DB_PATH)) {
    const empty: FileDatabase = {
      debates: [],
      messages: [],
      timelineEvents: [],
      reports: [],
    };
    writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), "utf-8");
    return empty;
  }

  const raw = JSON.parse(readFileSync(DB_PATH, "utf-8")) as Partial<FileDatabase>;
  return {
    debates: (raw.debates ?? []).map((d) => ({
      ...d,
      reportStatus: d.reportStatus ?? "none",
      llmMode: d.llmMode ?? "free",
      apiLayout: d.apiLayout ?? null,
      apiProvider: d.apiProvider ?? null,
      apiModel: d.apiModel ?? null,
      openaiModel: d.openaiModel ?? null,
      geminiModel: d.geminiModel ?? null,
      maxTokenBudget:
        (d.llmMode ?? "free") === "user_api"
          ? (d.maxTokenBudget ?? 0) > 0
            ? d.maxTokenBudget!
            : 30_000
          : d.maxTokenBudget ?? 0,
      tokensUsed: d.tokensUsed ?? 0,
      endReason: d.endReason ?? null,
    })),
    messages: raw.messages ?? [],
    timelineEvents: raw.timelineEvents ?? [],
    reports: raw.reports ?? [],
  };
}

function saveFileDb(db: FileDatabase): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

// ─── Public API ───

export function getStorageMode(): "supabase" | "file" {
  return isSupabaseEnabled() ? "supabase" : "file";
}

export async function listDebates(): Promise<Debate[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToDebate);
  }

  const db = ensureFileDb();
  return db.debates.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getDebate(id: string): Promise<Debate | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDebate(data) : null;
  }

  const db = ensureFileDb();
  return db.debates.find((d) => d.id === id) ?? null;
}

export async function getDebateMessages(debateId: string): Promise<DebateMessage[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("debate_messages")
      .select("*")
      .eq("debate_id", debateId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToMessage);
  }

  const db = ensureFileDb();
  return db.messages
    .filter((m) => m.debateId === debateId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export async function getTimelineEvents(debateId: string): Promise<TimelineEvent[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("timeline_events")
      .select("*")
      .eq("debate_id", debateId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToTimeline);
  }

  const db = ensureFileDb();
  return db.timelineEvents
    .filter((e) => e.debateId === debateId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export async function getDebateReport(debateId: string): Promise<DebateReport | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("debate_reports")
      .select("*")
      .eq("debate_id", debateId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToReport(data) : null;
  }

  const db = ensureFileDb();
  return db.reports.find((r) => r.debateId === debateId) ?? null;
}

export async function createDebate(
  topic: string,
  options?: {
    maxRounds?: number;
    turnIntervalMs?: number;
    userApi?: UserApiInput;
  },
): Promise<Debate> {
  const now = new Date().toISOString();
  const sb = getSupabase();
  const userApi = options?.userApi;
  const hasUserApi = !!userApi && !validateUserApiInput(userApi);
  const maxTokenBudget = hasUserApi
    ? Math.max(1_000, userApi!.maxTokenBudget ?? 30_000)
    : 0;

  const layout = userApi?.layout ?? "openai_only";
  const openaiModel = normalizeOpenaiModel(userApi?.openaiModel);
  const geminiModel = normalizeGeminiModel(userApi?.geminiModel);

  const llmFields = hasUserApi
    ? {
        llm_mode: "user_api" as const,
        api_layout: layout,
        api_provider:
          layout === "gemini_only"
            ? ("gemini" as const)
            : layout === "openai_only"
              ? ("openai" as const)
              : null,
        api_model: openaiModel,
        openai_model: openaiModel,
        gemini_model: geminiModel,
        encrypted_api_key: userApi!.openaiKey?.trim()
          ? encryptApiKey(userApi!.openaiKey.trim())
          : null,
        encrypted_gemini_key: userApi!.geminiKey?.trim()
          ? encryptApiKey(userApi!.geminiKey.trim())
          : null,
        max_token_budget: maxTokenBudget,
        tokens_used: 0,
      }
    : {
        llm_mode: "free" as const,
        api_layout: null,
        api_provider: null,
        api_model: null,
        openai_model: null,
        gemini_model: null,
        encrypted_api_key: null,
        encrypted_gemini_key: null,
        max_token_budget: 0,
        tokens_used: 0,
      };

  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .insert({
        topic: topic.trim(),
        status: "active",
        round: 0,
        max_rounds: options?.maxRounds ?? 20,
        turn_interval_ms: options?.turnIntervalMs ?? DEFAULT_TURN_INTERVAL_MS,
        report_status: "none",
        end_reason: null,
        ...llmFields,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToDebate(data);
  }

  const db = ensureFileDb();
  const debate: Debate = {
    id: uuidv4(),
    topic: topic.trim(),
    status: "active",
    round: 0,
    maxRounds: options?.maxRounds ?? 20,
    turnIntervalMs: options?.turnIntervalMs ?? DEFAULT_TURN_INTERVAL_MS,
    lastTurnAt: null,
    reportStatus: "none",
    llmMode: hasUserApi ? "user_api" : "free",
    apiLayout: hasUserApi ? layout : null,
    apiProvider: hasUserApi
      ? layout === "gemini_only"
        ? "gemini"
        : layout === "openai_only"
          ? "openai"
          : null
      : null,
    apiModel: hasUserApi ? openaiModel : null,
    openaiModel: hasUserApi ? openaiModel : null,
    geminiModel: hasUserApi ? geminiModel : null,
    encryptedApiKey: userApi?.openaiKey?.trim()
      ? encryptApiKey(userApi.openaiKey.trim())
      : null,
    encryptedGeminiKey: userApi?.geminiKey?.trim()
      ? encryptApiKey(userApi.geminiKey.trim())
      : null,
    maxTokenBudget,
    tokensUsed: 0,
    endReason: null,
    createdAt: now,
    updatedAt: now,
  };
  db.debates.push(debate);
  saveFileDb(db);
  return debate;
}

export async function addMessage(
  debateId: string,
  personaId: DebateMessage["personaId"],
  content: string,
  round: number,
  llmSource?: MessageLlmSource | null,
): Promise<DebateMessage> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    let payload: Record<string, unknown> = {
      debate_id: debateId,
      persona_id: personaId,
      content,
      round,
      created_at: now,
    };
    if (llmSource) payload.llm_source = llmSource;

    let { data, error } = await sb
      .from("debate_messages")
      .insert(payload)
      .select()
      .single();

    if (error && llmSource) {
      delete payload.llm_source;
      ({ data, error } = await sb
        .from("debate_messages")
        .insert(payload)
        .select()
        .single());
    }
    if (error) throw error;

    const message = rowToMessage(data);
    if (llmSource && !message.llmSource) {
      message.llmSource = llmSource;
    }

    await sb
      .from("debates")
      .update({ round, last_turn_at: now, updated_at: now })
      .eq("id", debateId);

    return message;
  }

  const db = ensureFileDb();
  const message: DebateMessage = {
    id: uuidv4(),
    debateId,
    personaId,
    content,
    round,
    createdAt: now,
    llmSource: llmSource ?? null,
  };
  db.messages.push(message);

  const debate = db.debates.find((d) => d.id === debateId);
  if (debate) {
    debate.round = round;
    debate.lastTurnAt = now;
    debate.updatedAt = now;
  }
  saveFileDb(db);
  return message;
}

export async function addTimelineEvent(
  event: Omit<TimelineEvent, "id" | "createdAt">,
): Promise<TimelineEvent> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("timeline_events")
      .insert({
        debate_id: event.debateId,
        type: event.type,
        title: event.title,
        summary: event.summary,
        round: event.round,
        message_id: event.messageId,
        created_at: now,
      })
      .select()
      .single();

    if (error) {
      // unique index on (debate_id, round) — 이미 있으면 무시
      if (error.code === "23505") {
        const existing = await getTimelineEvents(event.debateId);
        const found = existing.find((e) => e.round === event.round);
        if (found) return found;
      }
      throw error;
    }

    await sb
      .from("debates")
      .update({ updated_at: now })
      .eq("id", event.debateId);

    return rowToTimeline(data);
  }

  const db = ensureFileDb();
  const timelineEvent: TimelineEvent = {
    ...event,
    id: uuidv4(),
    createdAt: now,
  };
  db.timelineEvents.push(timelineEvent);

  const debate = db.debates.find((d) => d.id === event.debateId);
  if (debate) debate.updatedAt = now;

  saveFileDb(db);
  return timelineEvent;
}

export async function addTokenUsage(
  id: string,
  tokens: number,
): Promise<Debate | null> {
  if (tokens <= 0) return getDebate(id);

  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    const current = await getDebate(id);
    if (!current) return null;

    const { data, error } = await sb
      .from("debates")
      .update({
        tokens_used: current.tokensUsed + tokens,
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDebate(data) : null;
  }

  const db = ensureFileDb();
  const debate = db.debates.find((d) => d.id === id);
  if (!debate) return null;
  debate.tokensUsed += tokens;
  debate.updatedAt = now;
  saveFileDb(db);
  return debate;
}

export async function setDebateEndReason(
  id: string,
  endReason: string,
): Promise<Debate | null> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .update({ end_reason: endReason, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDebate(data) : null;
  }

  const db = ensureFileDb();
  const debate = db.debates.find((d) => d.id === id);
  if (!debate) return null;
  debate.endReason = endReason;
  debate.updatedAt = now;
  saveFileDb(db);
  return debate;
}

export async function updateDebateStatus(
  id: string,
  status: DebateStatus,
): Promise<Debate | null> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .update({ status, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDebate(data) : null;
  }

  const db = ensureFileDb();
  const debate = db.debates.find((d) => d.id === id);
  if (!debate) return null;
  debate.status = status;
  debate.updatedAt = now;
  saveFileDb(db);
  return debate;
}

export async function updateReportStatus(
  id: string,
  reportStatus: ReportStatus,
): Promise<Debate | null> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .update({ report_status: reportStatus, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDebate(data) : null;
  }

  const db = ensureFileDb();
  const debate = db.debates.find((d) => d.id === id);
  if (!debate) return null;
  debate.reportStatus = reportStatus;
  debate.updatedAt = now;
  saveFileDb(db);
  return debate;
}

export async function saveDebateReport(report: DebateReport): Promise<DebateReport> {
  const now = new Date().toISOString();
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb.from("debate_reports").upsert({
      debate_id: report.debateId,
      title: report.title,
      executive_summary: report.executiveSummary,
      consensus_points: report.consensusPoints,
      pro_arguments: report.proArguments,
      con_arguments: report.conArguments,
      unresolved_issues: report.unresolvedIssues,
      final_conclusion: report.finalConclusion,
      recommendation: report.recommendation,
      generated_at: report.generatedAt,
    });
    if (error) throw error;

    await sb
      .from("debates")
      .update({ report_status: "done", updated_at: now })
      .eq("id", report.debateId);

    return report;
  }

  const db = ensureFileDb();
  const index = db.reports.findIndex((r) => r.debateId === report.debateId);
  if (index >= 0) db.reports[index] = report;
  else db.reports.push(report);

  const debate = db.debates.find((d) => d.id === report.debateId);
  if (debate) {
    debate.reportStatus = "done";
    debate.updatedAt = now;
  }
  saveFileDb(db);
  return report;
}

export async function getActiveDebates(): Promise<Debate[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .select("*")
      .eq("status", "active");
    if (error) throw error;
    return (data ?? []).map(rowToDebate);
  }

  const db = ensureFileDb();
  return db.debates.filter((d) => d.status === "active");
}

export async function hasTimelineForRound(
  debateId: string,
  round: number,
): Promise<boolean> {
  const sb = getSupabase();
  if (sb) {
    const { count, error } = await sb
      .from("timeline_events")
      .select("*", { count: "exact", head: true })
      .eq("debate_id", debateId)
      .eq("round", round);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  const db = ensureFileDb();
  return db.timelineEvents.some(
    (e) => e.debateId === debateId && e.round === round,
  );
}

export async function deleteDebate(id: string): Promise<boolean> {
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("debates")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  const db = ensureFileDb();
  const exists = db.debates.some((d) => d.id === id);
  if (!exists) return false;

  db.debates = db.debates.filter((d) => d.id !== id);
  db.messages = db.messages.filter((m) => m.debateId !== id);
  db.timelineEvents = db.timelineEvents.filter((e) => e.debateId !== id);
  db.reports = db.reports.filter((r) => r.debateId !== id);
  saveFileDb(db);
  return true;
}
