import { NextResponse } from "next/server";
import { getDebate, updateDebateStatus } from "@/lib/db";
import { manualEndDebate } from "@/lib/debate-engine";
import type { DebateStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = getDebate(id);

  if (!debate) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await request.json();
  const status = body.status as DebateStatus;

  if (!["active", "paused", "ended"].includes(status)) {
    return NextResponse.json({ error: "잘못된 상태입니다." }, { status: 400 });
  }

  if (status === "ended" && debate.status !== "ended") {
    await manualEndDebate(id);
    const updated = getDebate(id);
    return NextResponse.json(updated);
  }

  const updated = updateDebateStatus(id, status);
  return NextResponse.json(updated);
}
