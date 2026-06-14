"use client";

import { useMemo, useState } from "react";
import type { ApiLayout } from "@/lib/types";
import {
  DEFAULT_MAX_TOKEN_BUDGET,
  type SavedApiSettings,
} from "@/lib/client-api-settings";
import { estimateTokenBudget } from "@/lib/token-budget-guide";
import { isLikelyGeminiKey } from "@/lib/gemini";
import { GEMINI_MODEL_OPTIONS } from "@/lib/gemini-models";
import { OPENAI_MODEL_OPTIONS } from "@/lib/openai-models";
import { personaDisplayName, personaNamesLabel } from "@/lib/personas";

const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
const GEMINI_KEYS_URL = "https://aistudio.google.com/apikey";

type LlmMode = "user_api";

const LAYOUT_OPTIONS: Array<{
  id: ApiLayout;
  title: string;
  desc: string;
}> = [
  { id: "gemini_only", title: "Gemini 3명", desc: "Gemini 키 1개 · 추천" },
  { id: "openai_only", title: "GPT 3명", desc: "OpenAI 키 1개" },
  {
    id: "gpt_vs_gemini",
    title: "GPT vs Gemini",
    desc: "두 AI가 교차 토론",
  },
];

const BUDGET_PRESETS = [10_000, 30_000, 100_000, 500_000];

interface ApiKeySetupPanelProps {
  layout: ApiLayout;
  onLayoutChange: (layout: ApiLayout) => void;
  openaiKey: string;
  onOpenaiKeyChange: (key: string) => void;
  geminiKey: string;
  onGeminiKeyChange: (key: string) => void;
  openaiModel: string;
  onOpenaiModelChange: (model: string) => void;
  geminiModel: string;
  onGeminiModelChange: (model: string) => void;
  maxTokenBudget: number;
  onMaxTokenBudgetChange: (n: number) => void;
  rememberKey: boolean;
  onRememberKeyChange: (v: boolean) => void;
}

function isLikelyOpenAiKey(key: string): boolean {
  const k = key.trim();
  return k.startsWith("sk-") && k.length >= 20;
}

function KeyField({
  label,
  value,
  onChange,
  placeholder,
  validate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  validate: (k: string) => boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const keyOk = validate(value);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onChange(text.trim());
    } catch {
      alert("클립보드 읽기에 실패했습니다. 직접 붙여넣어 주세요.");
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs text-white/45">{label}</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 pr-10 text-sm text-white outline-none focus:border-emerald-500/40"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-white/40 hover:text-white/70"
            aria-label={showKey ? "키 숨기기" : "키 보기"}
          >
            {showKey ? "숨김" : "보기"}
          </button>
        </div>
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
        >
          붙여넣기
        </button>
      </div>
      <p
        className={`mt-1.5 text-xs ${
          value.trim()
            ? keyOk
              ? "text-emerald-400/80"
              : "text-amber-400/80"
            : "text-white/35"
        }`}
      >
        {value.trim()
          ? keyOk
            ? "키 형식 OK"
            : "키 형식을 확인해 주세요"
          : "발급한 키를 붙여넣으면 됩니다"}
      </p>
    </div>
  );
}

export function ApiKeySetupPanel({
  layout,
  onLayoutChange,
  openaiKey,
  onOpenaiKeyChange,
  geminiKey,
  onGeminiKeyChange,
  openaiModel,
  onOpenaiModelChange,
  geminiModel,
  onGeminiModelChange,
  maxTokenBudget,
  onMaxTokenBudgetChange,
  rememberKey,
  onRememberKeyChange,
}: ApiKeySetupPanelProps) {
  const [guideOpen, setGuideOpen] = useState(true);

  const budgetGuide = useMemo(
    () => estimateTokenBudget(maxTokenBudget, layout),
    [maxTokenBudget, layout],
  );

  const needsOpenai = layout === "openai_only" || layout === "gpt_vs_gemini";
  const needsGemini = layout === "gemini_only" || layout === "gpt_vs_gemini";

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-emerald-200/90">
              API 키 · 모델 설정
            </p>
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              className="text-xs text-white/45 hover:text-white/70"
            >
              {guideOpen ? "가이드 접기" : "키 찾는 법 보기"}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onLayoutChange(opt.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  layout === opt.id
                    ? "border-emerald-500/50 bg-emerald-500/15 text-white"
                    : "border-white/10 bg-black/20 text-white/55 hover:border-white/20"
                }`}
              >
                <p className="text-xs font-semibold">{opt.title}</p>
                <p className="mt-0.5 text-[10px] opacity-70">{opt.desc}</p>
              </button>
            ))}
          </div>

          {layout === "gpt_vs_gemini" && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2 text-xs text-white/60">
              <span className="text-violet-300">GPT</span>: {personaDisplayName("atlas", "openai")} ·{" "}
              <span className="text-blue-300">Gemini</span>:{" "}
              {personaDisplayName("cipher", "gemini")}·
              {personaDisplayName("ember", "gemini")} — 서로
              다른 AI가 맞붙습니다
            </div>
          )}

          {guideOpen && (
            <div className="space-y-3 rounded-xl border border-white/8 bg-black/25 p-3 text-xs leading-relaxed text-white/60">
              {needsOpenai && (
                <div>
                  <p className="mb-2 font-medium text-white/75">
                    OpenAI 키 발급
                  </p>
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>
                      <a
                        href="https://platform.openai.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-300 underline-offset-2 hover:underline"
                      >
                        platform.openai.com
                      </a>
                      로그인 → API keys
                    </li>
                    <li>
                      Create new secret key →{" "}
                      <code className="text-white/70">sk-...</code> 복사
                    </li>
                  </ol>
                  <a
                    href={OPENAI_KEYS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                  >
                    OpenAI 키 발급 →
                  </a>
                </div>
              )}
              {needsGemini && (
                <div>
                  <p className="mb-2 font-medium text-white/75">
                    Gemini 키 발급 (무료 티어 토큰 많음)
                  </p>
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>
                      <a
                        href="https://aistudio.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 underline-offset-2 hover:underline"
                      >
                        aistudio.google.com
                      </a>
                      로그인 → Get API key
                    </li>
                    <li>
                      <code className="text-white/70">AIza...</code> 또는{" "}
                      <code className="text-white/70">AQ....</code> 키 복사
                    </li>
                  </ol>
                  <p className="mt-2 text-white/45">
                    2026년부터 신규 키는 <code className="text-white/60">AQ.</code>로
                    시작하는 경우가 많음 (AIza도 계속 사용 가능).
                    토큰이 0이면 API 연결 실패 — 키 재발급, 모델을 flash-lite로
                    변경, 또는 이 토론 삭제 후 새로 시작해 보세요.
                  </p>
                  <a
                    href={GEMINI_KEYS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                  >
                    Gemini 키 발급 →
                  </a>
                </div>
              )}
            </div>
          )}

          {needsOpenai && (
            <KeyField
              label="OpenAI API 키"
              value={openaiKey}
              onChange={onOpenaiKeyChange}
              placeholder="sk-proj-... 또는 sk-..."
              validate={isLikelyOpenAiKey}
            />
          )}

          {needsGemini && (
            <KeyField
              label="Gemini API 키"
              value={geminiKey}
              onChange={onGeminiKeyChange}
              placeholder="AIza... 또는 AQ...."
              validate={isLikelyGeminiKey}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {needsOpenai && (
              <label className="block text-xs text-white/45">
                GPT 모델
                <select
                  value={openaiModel}
                  onChange={(e) => onOpenaiModelChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {OPENAI_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needsGemini && (
              <label className="block text-xs text-white/45">
                Gemini 모델
                <select
                  value={geminiModel}
                  onChange={(e) => onGeminiModelChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {GEMINI_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-white/45">
              토큰 예산 (이 토론 최대 사용량)
            </label>
            <div className="flex flex-wrap gap-2">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onMaxTokenBudgetChange(preset)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    maxTokenBudget === preset
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : "border-white/10 bg-black/20 text-white/50 hover:border-white/20"
                  }`}
                >
                  {(preset / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1000}
              step={1000}
              value={maxTokenBudget}
              onChange={(e) =>
                onMaxTokenBudgetChange(
                  Number(e.target.value) || DEFAULT_MAX_TOKEN_BUDGET,
                )
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs leading-relaxed text-amber-100/80">
            <p className="mb-1 font-medium text-amber-200/90">
              토큰 예산 감 잡기
            </p>
            <p>{budgetGuide.summary}</p>
            <p className="mt-2 text-white/45">
              1턴 ≈ {budgetGuide.tokensPerTurn.toLocaleString()} 토큰 (발언 1개).
              4인 1라운드 ≈{" "}
              {(budgetGuide.tokensPerTurn * 4).toLocaleString()} 토큰.
              예: 30,000 토큰이면 발언 약 {estimateTokenBudget(30_000, layout).estimatedTurns}개 ·
              라운드 약 {estimateTokenBudget(30_000, layout).estimatedRounds}회.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-white/45">
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => onRememberKeyChange(e.target.checked)}
              className="rounded border-white/20"
            />
            이 브라우저에 키 저장 (다음에 자동 입력)
          </label>

          <p className="text-xs leading-relaxed text-white/35">
            24/7 백그라운드 토론을 위해 키는 서버에 암호화되어 해당 토론에만
            저장됩니다. 예산 초과·API 한도 소진 시 토론이 자동 종료됩니다.
          </p>
        </div>
    </div>
  );
}

export function settingsFromPanel(
  layout: ApiLayout,
  openaiKey: string,
  geminiKey: string,
  openaiModel: string,
  geminiModel: string,
  maxTokenBudget: number,
  rememberKey: boolean,
): SavedApiSettings | null {
  if (!rememberKey) return null;
  return {
    enabled: true,
    layout,
    openaiKey: openaiKey.trim(),
    geminiKey: geminiKey.trim(),
    openaiModel,
    geminiModel,
    maxTokenBudget,
  };
}
