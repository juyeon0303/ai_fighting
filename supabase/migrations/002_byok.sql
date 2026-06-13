-- BYOK (유저 API 키) 마이그레이션
-- Supabase SQL Editor에서 실행

alter table debates add column if not exists llm_mode text not null default 'free'
  check (llm_mode in ('free', 'user_api'));
alter table debates add column if not exists api_provider text;
alter table debates add column if not exists api_model text;
alter table debates add column if not exists encrypted_api_key text;
alter table debates add column if not exists max_token_budget int not null default 0;
alter table debates add column if not exists tokens_used int not null default 0;
alter table debates add column if not exists end_reason text;
