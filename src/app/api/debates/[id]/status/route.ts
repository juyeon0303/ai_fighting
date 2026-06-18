import { NextResponse } from "next/server";
import { getDebate, updateDebateStatus } from "@/lib/db";
import { finalizeDebate, manualEndDebate } from "@/lib/debate-engine";
import type { DebateStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = await getDebate(id);

  if (!debate) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await request.json();
  const status = body.status as DebateStatus;

  if (!["active", "paused", "ended"].includes(status)) {
    return NextResponse.json({ error: "잘못된 상태입니다." }, { status: 400 });
  }

  if (status === "ended") {
    if (debate.status !== "ended") {
      await manualEndDebate(id);
    } else if (debate.reportStatus !== "done") {
      await finalizeDebate(id);
    }
    const updated = await getDebate(id);
    return NextResponse.json(updated);
  }

  const updated = await updateDebateStatus(id, status);
  return NextResponse.json(updated);
}
