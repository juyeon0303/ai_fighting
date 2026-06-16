import { submitGodIntervention } from "@/lib/debate-engine";
import { getDebate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = await getDebate(id);

  if (!debate) {
    return Response.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  if (debate.status !== "active") {
    return Response.json(
      { error: "진행 중인 토론에만 개입할 수 있습니다." },
      { status: 400 },
    );
  }

  let body: { content?: string };
  try {
    body = (await request.json()) as { content?: string };
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) {
    return Response.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  if (content.length > 400) {
    return Response.json(
      { error: "400자 이내로 입력해 주세요." },
      { status: 400 },
    );
  }

  const message = await submitGodIntervention(id, content);
  if (!message) {
    return Response.json({ error: "개입을 저장하지 못했습니다." }, { status: 500 });
  }

  return Response.json({ message });
}
