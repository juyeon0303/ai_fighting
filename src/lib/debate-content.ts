import type { ApiProvider, DebateMessage, PersonaId } from "./types";
import type { TopicContext } from "./topic-context";
import {
  personaDisplayName,
  personaNamesLabel,
  providerFromMessageSource,
} from "./personas";

export type ChatTurn = { role: "user" | "assistant"; text: string };

const META_LINE =
  /^\s*\*.*\*?\s*$|casual tone|banmal|Yes\.|^\s*-\s*(GE|MI|NI)\s*:/i;

/** 페르소나별 system — Gemini 앱처럼 역할을 분리 */
export function personaSystemInstruction(
  topic: string,
  personaId: PersonaId,
  provider: ApiProvider,
): string {
  const name = personaDisplayName(personaId, provider);
  const roles: Record<PersonaId, string> = {
    atlas:
      "큰 그림·핵심 변수·장기적 흐름을 짚어. 가능하면 숫자·사례 하나.",
    cipher:
      "근거·반례·논리를 들어. 직전 말에 동의하거나 반박해.",
    ember:
      "쉬운 비유로 설명해. 추상 철학 말고 체감 위주.",
  };

  return [
    `친구들이랑 「${topic}」 토론 중. 너는 ${name}.`,
    roles[personaId],
    "2~4문장, 편한 반말로 자연스럽게.",
    "에세이체·「결국」남발·실존·미완·셈이지·체크리스트·메타 출력 금지.",
    "이름·콜론(:) 붙이지 마.",
  ].join(" ");
}

function openingUserMessage(topic: string, provider: ApiProvider): string {
  return `주제: 「${topic}」\n\n${personaNamesLabel(provider)} 셋이 친한 친구처럼 자유롭게 토론해.`;
}

function currentTurnUserPrompt(
  personaId: PersonaId,
  provider: ApiProvider,
  history: DebateMessage[],
): string {
  const name = personaDisplayName(personaId, provider);
  if (history.length === 0) {
    return `${name}, 네가 먼저 말해.`;
  }
  const last = history[history.length - 1]!;
  const lastName = personaDisplayName(
    last.personaId,
    providerFromMessageSource(last.llmSource),
  );
  return `${name} 차례야. ${lastName} 말에 동의하거나 반박하면서 이어서 말해. 같은 말 반복 말고 구체적으로.`;
}

/** Gemini API 멀티턴 contents (user/model 교차) */
export function buildGeminiContents(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
): Array<{ role: "user" | "model"; text: string }> {
  if (history.length === 0) {
    return [
      {
        role: "user",
        text: `${openingUserMessage(topic, provider)}\n\n${currentTurnUserPrompt(personaId, provider, history)}`,
      },
    ];
  }

  const contents: Array<{ role: "user" | "model"; text: string }> = [
    { role: "user", text: openingUserMessage(topic, provider) },
  ];

  for (const msg of history) {
    contents.push({ role: "model", text: msg.content });
    contents.push({ role: "user", text: "이어서." });
  }

  contents.pop();
  contents.push({
    role: "user",
    text: currentTurnUserPrompt(personaId, provider, history),
  });

  return contents;
}

/** OpenAI chat messages (system 제외) */
export function buildOpenAiChatTurns(
  topic: string,
  history: DebateMessage[],
  personaId: PersonaId,
  provider: ApiProvider,
): ChatTurn[] {
  if (history.length === 0) {
    return [
      {
        role: "user",
        text: `${openingUserMessage(topic, provider)}\n\n${currentTurnUserPrompt(personaId, provider, history)}`,
      },
    ];
  }

  const turns: ChatTurn[] = [
    { role: "user", text: openingUserMessage(topic, provider) },
  ];

  for (const msg of history) {
    turns.push({ role: "assistant", text: msg.content });
    turns.push({ role: "user", text: "이어서." });
  }

  turns.pop();
  turns.push({
    role: "user",
    text: currentTurnUserPrompt(personaId, provider, history),
  });

  return turns;
}

/** 모델 메타·라벨 오염 제거 */
export function sanitizeTurnOutput(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !META_LINE.test(l));

  let text = lines.join(" ").replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:GE|MI|NI|G|P|T)\s*:\s*/i, "");
  return text.trim();
}

export function buildDebateRetryHint(): string {
  return "방금 답이 이상했어. 친구 반말로 완전한 2~4문장만 다시 말해.";
}

/** @deprecated 시뮬 호환 — 멀티턴 첫 user 메시지 검증용 */
export function buildDebatePrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  _round: number,
  provider: ApiProvider,
): string {
  const contents = buildGeminiContents(
    ctx.topic,
    history,
    personaId,
    provider,
  );
  return contents.map((c) => `[${c.role}] ${c.text}`).join("\n");
}
