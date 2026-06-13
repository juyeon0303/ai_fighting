import { NextResponse } from "next/server";
import { createDebate, listDebates } from "@/lib/db";
import { kickstartDebate } from "@/lib/debate-engine";

export async function GET() {
  const debates = listDebates();
  return NextResponse.json(debates);
}

export async function POST(request: Request) {
  const body = await request.json();
  const topic = body.topic as string;

  if (!topic?.trim()) {
    return NextResponse.json({ error: "주제를 입력해주세요." }, { status: 400 });
  }

  const debate = createDebate(topic, {
    maxRounds: body.maxRounds ?? 20,
    turnIntervalMs: body.turnIntervalMs ?? 8000,
  });

  kickstartDebate(debate.id).catch(console.error);

  return NextResponse.json(debate, { status: 201 });
}
