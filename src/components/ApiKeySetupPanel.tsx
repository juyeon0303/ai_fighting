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
import { personaDisplayName } from "@/lib/personas";

const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
const GEMINI_KEYS_URL = "https://aistudio.google.com/apikey";

const LAYOUT_OPTIONS: Array<{ id: ApiLayout; title: string }> = [
  { id: "gemini_only", title: "Gemini" },
  { id: "openai_only", title: "GPT" },
  { id: "gpt_vs_gemini", title: "Mix" },
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
  tokenSaveMode: boolean;
  onTokenSaveModeChange: (v: boolean) => void;
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
  helpUrl,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  validate: (k: string) => boolean;
  helpUrl: string;
}) {
  const [showKey, setShowKey] = useState(false);
  const keyOk = validate(value);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onChange(text.trim());
    } catch {
      alert("클립보드 읽기에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-white/50">{label}</label>
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-white/30 hover:text-white/55"
        >
          키 발급 →
        </a>
      </div>
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-lg border bg-black/20 px-3 py-2 pr-16 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[var(--brand-gold)]/25 ${
              value.trim()
                ? keyOk
                  ? "border-[var(--brand-jade)]/30"
                  : "border-amber-500/30"
                : "border-[var(--brand-gold)]/12"
            }`}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded px-1.5 py-0.5 text-[10px] text-white/35 hover:text-white/60"
            >
              {showKey ? "숨김" : "보기"}
            </button>
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="rounded px-1.5 py-0.5 text-[10px] text-white/35 hover:text-white/60"
            >
              붙여넣기
            </button>
          </div>
        </div>
      </div>
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
  tokenSaveMode,
  onTokenSaveModeChange,
  rememberKey,
  onRememberKeyChange,
}: ApiKeySetupPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const budgetGuide = useMemo(
    () => estimateTokenBudget(maxTokenBudget, layout, undefined, tokenSaveMode),
    [maxTokenBudget, layout, tokenSaveMode],
  );

  const needsOpenai = layout === "openai_only" || layout === "gpt_vs_gemini";
  const needsGemini = layout === "gemini_only" || layout === "gpt_vs_gemini";

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-[var(--brand-gold)]/12 bg-black/15 p-0.5">
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onLayoutChange(opt.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              layout === opt.id
                ? "bg-[var(--brand-gold)]/15 text-[var(--brand-gold-light)]"
                : "text-[var(--brand-paper)]/45 hover:text-[var(--brand-paper)]/70"
            }`}
          >
            {opt.title}
          </button>
        ))}
      </div>

      {layout === "gpt_vs_gemini" && (
        <p className="text-[11px] text-white/35">
          GPT {personaDisplayName("atlas", "openai")} · Gemini{" "}
          {personaDisplayName("cipher", "gemini")}·
          {personaDisplayName("ember", "gemini")}
        </p>
      )}

      <div className="space-y-3">
        {needsGemini && (
          <KeyField
            label="Gemini API 키"
            value={geminiKey}
            onChange={onGeminiKeyChange}
            placeholder="AIza... 또는 AQ...."
            validate={isLikelyGeminiKey}
            helpUrl={GEMINI_KEYS_URL}
          />
        )}
        {needsOpenai && (
          <KeyField
            label="OpenAI API 키"
            value={openaiKey}
            onChange={onOpenaiKeyChange}
            placeholder="sk-..."
            validate={isLikelyOpenAiKey}
            helpUrl={OPENAI_KEYS_URL}
          />
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {needsGemini && (
          <label className="block text-[11px] text-white/40">
            Gemini 모델
            <select
              value={geminiModel}
              onChange={(e) => onGeminiModelChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white outline-none focus:border-white/20"
            >
              {GEMINI_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsOpenai && (
          <label className="block text-[11px] text-white/40">
            GPT 모델
            <select
              value={openaiModel}
              onChange={(e) => onOpenaiModelChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white outline-none focus:border-white/20"
            >
              {OPENAI_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-white/8 px-3 py-2 text-left text-xs text-white/45 transition hover:border-white/15 hover:text-white/60"
      >
        <span>예산 · 옵션</span>
        <span className="text-white/25">{advancedOpen ? "−" : "+"}</span>
      </button>

      {advancedOpen && (
        <div className="space-y-3 rounded-lg border border-white/8 bg-black/10 p-3">
          <div>
            <p className="mb-2 text-[11px] text-white/40">토큰 예산</p>
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onMaxTokenBudgetChange(preset)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                    maxTokenBudget === preset
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 text-white/45 hover:border-white/20"
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
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none focus:border-white/20"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-white/30">
              {budgetGuide.summary}
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/45">
            <input
              type="checkbox"
              checked={tokenSaveMode}
              onChange={(e) => onTokenSaveModeChange(e.target.checked)}
              className="rounded border-white/20"
            />
            토큰절약 (발언 1~3문장)
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/45">
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => onRememberKeyChange(e.target.checked)}
              className="rounded border-white/20"
            />
            이 브라우저에 키 저장
          </label>

          <p className="text-[10px] leading-relaxed text-white/25">
            키는 암호화되어 해당 토론에만 사용됩니다.
          </p>
        </div>
      )}
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
  tokenSaveMode: boolean,
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
    tokenSaveMode,
  };
}
