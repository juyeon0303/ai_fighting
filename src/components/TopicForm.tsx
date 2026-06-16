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
  const [tokenSaveMode, setTokenSaveMode] = useState(false);
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
    setTokenSaveMode(saved.tokenSaveMode ?? false);
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
      tokenSaveMode,
    });
    if (err) {
      if (err.includes("토큰")) {
        alert("토큰이 부족합니다");
      } else {
        alert(err);
      }
      return;
    }

    const toSave = settingsFromPanel(
      layout,
      openaiKey,
      geminiKey,
      openaiModel,
      geminiModel,
      maxTokenBudget,
      tokenSaveMode,
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
            tokenSaveMode,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? "생성 실패";
        if (msg.includes("토큰")) {
          alert("토큰이 부족합니다");
        }
        throw new Error(msg);
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

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
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
          tokenSaveMode={tokenSaveMode}
          onTokenSaveModeChange={setTokenSaveMode}
          rememberKey={rememberKey}
          onRememberKeyChange={setRememberKey}
        />

        <div className="mt-5 border-t border-white/8 pt-5">
          <label className="mb-2 block text-xs text-white/45">토론 주제</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 동양 vs 서양 사고방식"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-white/20"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!topic.trim() || loading}
              className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "생성 중..." : "토론 시작"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
