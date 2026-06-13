-- Gemini + GPT vs Gemini 교차 토론
alter table debates add column if not exists api_layout text
  check (api_layout is null or api_layout in ('openai_only', 'gemini_only', 'gpt_vs_gemini'));
alter table debates add column if not exists encrypted_gemini_key text;
alter table debates add column if not exists openai_model text;
alter table debates add column if not exists gemini_model text;
