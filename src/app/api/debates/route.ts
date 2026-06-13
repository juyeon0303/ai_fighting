import { NextResponse } from "next/server";
import { createDebate, listDebates } from "@/lib/db";
import { kickstartDebate } from "@/lib/debate-engine";
import {
  sanitizeDebateForClient,
  validateUserApiInput,
} from "@/lib/debate-llm-config";
import type { UserApiInput } from "@/lib/debate-llm-config";
import { prefetchWikiContext } from "@/lib/wiki-context";
import type { ApiLayout } from "@/lib/types";

export async function GET() {
  const debates = await listDebates();
  return NextResponse.json(debates.map(sanitizeDebateForClient));
}

export async function POST(request: Request) {
  const body = await request.json();
  const topic = body.topic as string;

  if (!topic?.trim()) {
    return NextResponse.json({ error: "주제를 입력해주세요." }, { status: 400 });
  }

  let userApi: UserApiInput | undefined;
  if (body.userApi) {
    const input: UserApiInput = {
      layout: (body.userApi.layout as ApiLayout) ?? "openai_only",
      openaiKey: body.userApi.openaiKey?.trim(),
      geminiKey: body.userApi.geminiKey?.trim(),
      openaiModel: body.userApi.openaiModel ?? "gpt-4o-mini",
      geminiModel: body.userApi.geminiModel ?? "gemini-2.0-flash",
      maxTokenBudget: body.userApi.maxTokenBudget,
    };
    const validationError = validateUserApiInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    userApi = input;
  }

  const debate = await createDebate(topic, {
    maxRounds: body.maxRounds ?? 20,
    turnIntervalMs: body.turnIntervalMs ?? 8000,
    userApi,
  });

  prefetchWikiContext(topic.trim());

  kickstartDebate(debate.id).catch(console.error);

  return NextResponse.json(sanitizeDebateForClient(debate), { status: 201 });
}
