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
import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini-models";
import { DEFAULT_OPENAI_MODEL } from "@/lib/openai-models";
import type { ApiLayout } from "@/lib/types";

export function TopicForm() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<ApiLayout>("gemini_only");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_OPENAI_MODEL);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [maxTokenBudget, setMaxTokenBudget] = useState(DEFAULT_MAX_TOKEN_BUDGET);
  const [rememberKey, setRememberKey] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const saved = loadApiSettings();
    if (!saved) return;
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

    const toSave = settingsFromPanel(
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
      const res = await fetch("/api/debates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          userApi: {
            layout,
            openaiKey: openaiKey.trim() || undefined,
            geminiKey: geminiKey.trim() || undefined,
            openaiModel,
            geminiModel,
            maxTokenBudget,
          },
        }),
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
    layout === "gpt_vs_gemini"
      ? "GPT vs Gemini 교차 토론 · 예산 내에서만 실행"
      : layout === "gemini_only"
        ? "Gemini 3명이 순수 API로 토론"
        : "GPT 3명이 순수 API로 토론";

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <ApiKeySetupPanel
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
          placeholder="예: 동양 vs 서양 사고방식"
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
