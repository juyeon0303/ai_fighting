import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import { getGeniusLens } from "./topic-context";
import { personaDisplayName, providerFromMessageSource } from "./personas";
import { compactHistory, truncateForPrompt } from "./debate-turn-budget";

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
  const lastMsg = history.length > 0 ? history[history.length - 1] : null;
  const lastPeer = lastMsg
    ? `직전(${personaDisplayName(lastMsg.personaId, providerFromMessageSource(lastMsg.llmSource))}): ${truncateForPrompt(lastMsg.content, 140)}`
    : "";

  const threadRule =
    history.length > 0
      ? [
          "직전 발언에 이어받아 한 단계 더 깊게 말해.",
          "주제를 처음부터 다시 설명하지 마. 동양·서양 정의·비유 반복 금지.",
          "이미 나온 말을 다른 표현으로 되풀이하지 마.",
        ].join(" ")
      : "주제에 첫 반응을 해.";

  const lines = [
    `맥락: ${ctx.topic}`,
    `너는 ${name}. ${lens}`,
    `라운드 ${round}`,
    history.length > 0 ? `지금까지:\n${compactHistory(history)}` : "",
    lastPeer,
    threadRule,
    "친한 친구처럼 무난한 반말로 완전한 문장 1~2개만 말해. 중간에 끊기지 않게.",
    "이름·호칭·콜론(:) 붙이지 마. 찬성/반대/중립 입장으로 나누지 마.",
  ];

  return lines.filter(Boolean).join("\n");
}

export function buildDebateRetryHint(): string {
  return "방금 답이 중간에 끊겼어. 완전한 문장 1~2개로 다시 말해.";
}
