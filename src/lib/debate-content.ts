import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import { getGeniusLens } from "./topic-context";
import { personaDisplayName } from "./personas";
import { compactHistory } from "./debate-turn-budget";

/** LLM에 넘기는 최소 프롬프트 — 템플릿·위키·품질 필터 없음 */
export function buildDebatePrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
  provider: ApiProvider,
): string {
  const name = personaDisplayName(personaId, provider);
  const lens = getGeniusLens(personaId, ctx);

  const lines = [
    `주제: ${ctx.topic}`,
    `너는 ${name}. ${lens}`,
    `라운드 ${round}`,
    history.length > 0 ? `지금까지:\n${compactHistory(history)}` : "",
    "친한 친구처럼 무난한 반말로 1~2문장만 말해.",
    "이름·호칭·콜론(:) 붙이지 마. 찬성/반대/중립 입장으로 나누지 마.",
  ];

  return lines.filter(Boolean).join("\n");
}
