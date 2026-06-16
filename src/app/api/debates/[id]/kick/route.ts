import { NextResponse } from "next/server";
import { getDebate, getDebateMessages } from "@/lib/db";
import {
  kickstartDebate,
  processDebateTurn,
  startDebateWorker,
} from "@/lib/debate-engine";
import { sanitizeDebateForClient } from "@/lib/debate-llm-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = await getDebate(id);

  if (!debate) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  if (debate.status !== "active") {
    const messages = await getDebateMessages(id);
    return NextResponse.json({
      ok: true,
      started: false,
      status: debate.status,
      messageCount: messages.length,
      debate: sanitizeDebateForClient(debate),
    });
  }

  await kickstartDebate(id);

  const freshDebate = await getDebate(id);
  const messages = await getDebateMessages(id);

  return NextResponse.json({
    ok: true,
    started: true,
    status: freshDebate?.status ?? debate.status,
    endReason: freshDebate?.endReason ?? null,
    messageCount: messages.length,
    tokensUsed: freshDebate?.tokensUsed ?? debate.tokensUsed,
    debate: freshDebate ? sanitizeDebateForClient(freshDebate) : null,
  });
}

/** GET — 클라이언트 폴링용 (가벼운 kick) */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (new URL(request.url).searchParams.get("full") === "1") {
    return POST(request, ctx);
  }

  const { id } = await ctx.params;
  await kickstartDebate(id);
  const messages = await getDebateMessages(id);
  const debate = await getDebate(id);
  return NextResponse.json({
    ok: true,
    messageCount: messages.length,
    status: debate?.status ?? "unknown",
    endReason: debate?.endReason ?? null,
  });
}
