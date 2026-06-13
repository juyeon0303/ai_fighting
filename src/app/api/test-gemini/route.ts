import { NextResponse } from "next/server";
import { requestGeminiTurn } from "@/lib/gemini";
import { DEFAULT_GEMINI_MODEL, normalizeGeminiModel } from "@/lib/gemini-models";

export async function POST(request: Request) {
  const body = await request.json();
  const apiKey = body.apiKey?.trim() as string | undefined;
  const model = normalizeGeminiModel(body.model as string | undefined);

  if (!apiKey) {
    return NextResponse.json({ error: "apiKey 필요" }, { status: 400 });
  }

  const result = await requestGeminiTurn(
    apiKey,
    model,
    "한국어로 짧게 답해.",
    "페이커와 쵸비 중 누가 더 강한지 한 문장으로.",
  );

  return NextResponse.json({
    ok: !!result.content,
    content: result.content,
    tokensUsed: result.tokensUsed,
    stopReason: result.stopReason,
  });
}
