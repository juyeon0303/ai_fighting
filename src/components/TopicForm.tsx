"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiKeySetupPanel, settingsFromPanel } from "./ApiKeySetupPanel";
import {
  DEFAULT_MAX_TOKEN_BUDGET,
  loadApiSettings,
  saveApiSettings,
} from "@/lib/client-api-settings";
import { validateUserApiInput } from "@/lib/debate-llm-config";
import type { ApiLayout } from "@/lib/types";

export function TopicForm() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"free" | "user_api">("free");
  const [layout, setLayout] = useState<ApiLayout>("openai_only");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [geminiModel, setGeminiModel] = useState("gemini-2.0-flash");
  const [maxTokenBudget, setMaxTokenBudget] = useState(DEFAULT_MAX_TOKEN_BUDGET);
  const [rememberKey, setRememberKey] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const saved = loadApiSettings();
    if (!saved) return;
    if (saved.enabled) setMode("user_api");
    setLayout(saved.layout);
    setOpenaiKey(saved.openaiKey);
    setGeminiKey(saved.geminiKey);
    setOpenaiModel(saved.openaiModel);
    setGeminiModel(saved.geminiModel);
    setMaxTokenBudget(saved.maxTokenBudget);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || loading) return;

    if (mode === "user_api") {
      const err = validateUserApiInput({
        layout,
        openaiKey,
        geminiKey,
        openaiModel,
        geminiModel,
        maxTokenBudget,
      });
      if (err) {
        alert(err);
        return;
      }
    }

    const toSave = settingsFromPanel(
      mode,
      layout,
      openaiKey,
      geminiKey,
      openaiModel,
      geminiModel,
      maxTokenBudget,
      rememberKey,
    );
    if (toSave) saveApiSettings(toSave);

    setLoading(true);
    try {
      const body: Record<string, unknown> = { topic };
      if (mode === "user_api") {
        body.userApi = {
          layout,
          openaiKey: openaiKey.trim() || undefined,
          geminiKey: geminiKey.trim() || undefined,
          openaiModel,
          geminiModel,
          maxTokenBudget,
        };
      }

      const res = await fetch("/api/debates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "생성 실패");
      }

      const debate = await res.json();
      router.push(`/debate/${debate.id}`);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "토론 생성에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const modeHint =
    mode === "user_api"
      ? layout === "gpt_vs_gemini"
        ? "GPT vs Gemini 교차 토론 · 예산 내에서만 실행"
        : layout === "gemini_only"
          ? "Gemini API로 토론 · 예산 내에서만 실행"
          : "GPT API로 토론 · 예산 내에서만 실행"
      : "무료 엔진으로 토론 · API 키 불필요";

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <ApiKeySetupPanel
        mode={mode}
        onModeChange={setMode}
        layout={layout}
        onLayoutChange={setLayout}
        openaiKey={openaiKey}
        onOpenaiKeyChange={setOpenaiKey}
        geminiKey={geminiKey}
        onGeminiKeyChange={setGeminiKey}
        openaiModel={openaiModel}
        onOpenaiModelChange={setOpenaiModel}
        geminiModel={geminiModel}
        onGeminiModelChange={setGeminiModel}
        maxTokenBudget={maxTokenBudget}
        onMaxTokenBudgetChange={setMaxTokenBudget}
        rememberKey={rememberKey}
        onRememberKeyChange={setRememberKey}
      />

      <div className="relative">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 인공지능이 인간의 일자리를 대체해야 하는가?"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-5 pr-36 text-lg text-white placeholder:text-white/30 outline-none transition focus:border-violet-500/50 focus:bg-white/8"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!topic.trim() || loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "생성 중..." : "토론 시작 →"}
        </button>
      </div>

      <p className="text-center text-sm text-white/40">{modeHint}</p>
    </form>
  );
}
