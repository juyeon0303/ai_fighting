import { NextResponse } from "next/server";
import {
  deleteDebate,
  getDebate,
  getDebateMessages,
  getDebateReport,
} from "@/lib/db";
import { sanitizeDebateForClient } from "@/lib/debate-llm-config";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = await getDebate(id);

  if (!debate) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  const [messages, report] = await Promise.all([
    getDebateMessages(id),
    getDebateReport(id),
  ]);

  return NextResponse.json({
    ...sanitizeDebateForClient(debate),
    messages,
    timeline: [],
    report,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteDebate(id);

  if (!deleted) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
