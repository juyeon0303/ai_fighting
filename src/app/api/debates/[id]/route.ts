import { NextResponse } from "next/server";
import {
  getDebate,
  getDebateMessages,
  getDebateReport,
  getTimelineEvents,
} from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = getDebate(id);

  if (!debate) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  const messages = getDebateMessages(id);
  const timeline = getTimelineEvents(id);
  const report = getDebateReport(id);

  return NextResponse.json({ ...debate, messages, timeline, report });
}
