-- Supabase SQL Editor에서 실행하세요
-- https://supabase.com/dashboard → 프로젝트 → SQL Editor

create extension if not exists "pgcrypto";

create table if not exists debates (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  round int not null default 0,
  max_rounds int not null default 20,
  turn_interval_ms int not null default 8000,
  last_turn_at timestamptz,
  report_status text not null default 'none' check (report_status in ('none', 'generating', 'done')),
  llm_mode text not null default 'free' check (llm_mode in ('free', 'user_api')),
  api_layout text check (api_layout is null or api_layout in ('openai_only', 'gemini_only', 'gpt_vs_gemini')),
  api_provider text,
  api_model text,
  openai_model text,
  gemini_model text,
  encrypted_api_key text,
  encrypted_gemini_key text,
  max_token_budget int not null default 0,
  tokens_used int not null default 0,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists debate_messages (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references debates(id) on delete cascade,
  persona_id text not null check (persona_id in ('pro', 'con', 'neutral', 'moderator')),
  content text not null,
  round int not null,
  created_at timestamptz not null default now()
);

create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references debates(id) on delete cascade,
  type text not null check (type in ('consensus', 'turning_point', 'conflict')),
  title text not null,
  summary text not null,
  round int not null,
  message_id uuid references debate_messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists debate_reports (
  debate_id uuid primary key references debates(id) on delete cascade,
  title text not null,
  executive_summary text not null,
  consensus_points jsonb not null default '[]',
  pro_arguments jsonb not null default '[]',
  con_arguments jsonb not null default '[]',
  unresolved_issues jsonb not null default '[]',
  final_conclusion text not null,
  recommendation text not null,
  generated_at timestamptz not null default now()
);

create index if not exists idx_debate_messages_debate_id on debate_messages(debate_id);
create index if not exists idx_timeline_events_debate_id on timeline_events(debate_id);
create index if not exists idx_debates_status on debates(status);
create index if not exists idx_debates_updated_at on debates(updated_at desc);

-- 라운드당 타임라인 중복 방지
create unique index if not exists idx_timeline_debate_round
  on timeline_events(debate_id, round);
