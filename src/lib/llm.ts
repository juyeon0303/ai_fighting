import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import { getPersona } from "./personas";
import {
  getPersonaStance,
  parseTopic,
  type TopicContext,
} from "./topic-context";

function getMockVersusResponse(
  ctx: TopicContext,
  personaId: PersonaId,
  round: number,
): string {
  const a = ctx.sideA!;
  const b = ctx.sideB!;
  const i = (round - 1) % 3;

  const responses: Record<PersonaId, string[]> = {
    moderator: [
      `오늘의 대결 주제는 「${a} vs ${b}」입니다. 찬성 AI는 ${a} 편, 반대 AI는 ${b} 편입니다. 각자 왜 자신의 편이 우위인지 구체적으로 말해주세요.`,
      `지금까지 ${a}와 ${b} 양측의 핵심 논거가 나왔습니다. 실력, 성과, 영향력 중 어떤 기준이 더 설득력 있는지 짚어보죠.`,
      `${a}와 ${b} 비교에서 결정적 차이가 드러나고 있습니다. 다음 라운드에서는 상대방 주장에 직접 반박해주세요.`,
    ],
    pro: [
      `${a}가 더 뛰어납니다. ${a}의 실적과 영향력은 ${b}와 비교할 때 분명한 우위를 보여줍니다.`,
      `${b} 측이 말하는 약점은 특정 맥락에 국한된 것입니다. ${a}의 전체 커리어와 핵심 강점을 보면 판단이 달라집니다.`,
      `결국 ${a}는 이 대결에서 더 설득력 있는 근거를 가지고 있습니다. ${b} 편 주장은 반박 가능한 예외에 불과합니다.`,
    ],
    con: [
      `${b}가 ${a}보다 낫습니다. ${b}의 강점은 단순 수치가 아니라 실전에서 드러나는 압도적 기량입니다.`,
      `${a} 편 논리는 과거 성과에 치우쳐 있습니다. 현재 기준으로 보면 ${b}의 가치가 더 크게 평가되어야 합니다.`,
      `${a}의 약점이 이번 논의에서 분명히 드러났습니다. 종합하면 ${b}가 이 대결에서 더 설득력 있습니다.`,
    ],
    neutral: [
      `${a}와 ${b} 모두 강점이 뚜렷합니다. 다만 비교 기준(성과, 기량, 영향력)에 따라 우위가 달라질 수 있습니다.`,
      `양측 주장을 보면 ${a}는 누적 성과, ${b}는 현재 영향력 측면에서 각각 설득력이 있습니다.`,
      `절대적 1위보다는 '어떤 기준으로 보냐'가 핵심입니다. 맥락에 따라 ${a} 또는 ${b} 모두 일리가 있습니다.`,
    ],
  };

  return responses[personaId][i];
}

function getMockPropositionResponse(
  ctx: TopicContext,
  personaId: PersonaId,
  round: number,
): string {
  const t = ctx.topic;
  const i = (round - 1) % 3;

  const responses: Record<PersonaId, string[]> = {
    moderator: [
      `주제 「${t}」에 대한 찬반 토론을 시작합니다. 찬성·반대 측, 이 주제에 맞는 구체적 근거를 제시해주세요.`,
      `양측 모두 「${t}」와 직접 관련된 논점을 잘 짚었습니다. 핵심 쟁점을 한 단계 더 좁혀보죠.`,
      `지금까지의 논의를 정리하면, 「${t}」에 대한 핵심 쟁점이 분명해졌습니다.`,
    ],
    pro: [
      `「${t}」에 찬성합니다. 이 주제의 긍정적 효과와 필요성이 분명히 존재합니다.`,
      `반대 측 우려는 이해하지만, 「${t}」의 이점이 리스크를 상회합니다. 구체적 사례가 이를 뒷받침합니다.`,
      `결론적으로 「${t}」는 타당합니다. 지금 논의된 근거만으로도 찬성 입장이 더 설득력 있습니다.`,
    ],
    con: [
      `「${t}」에 반대합니다. 겉보기 이점보다 부작용과 한계가 더 큽니다.`,
      `찬성 측 논리는 「${t}」의 핵심 문제를 간과합니다. 현실적 비용을 반드시 고려해야 합니다.`,
      `「${t}」는 성급합니다. 더 신중한 검토 없이 받아들이기 어렵습니다.`,
    ],
    neutral: [
      `「${t}」는 찬반 양면이 공존합니다. 어떤 조건에서 성립하는지가 관건입니다.`,
      `핵심은 「${t}」가 누구에게, 어떤 상황에서 적용되느냐입니다.`,
      `양측 논리를 종합하면, 「${t}」에 대한 조건부 접근이 가장 현실적입니다.`,
    ],
  };

  return responses[personaId][i];
}

function getMockOpenResponse(
  ctx: TopicContext,
  personaId: PersonaId,
  round: number,
  history: DebateMessage[],
): string {
  const t = ctx.topic;
  const i = (round - 1) % 3;
  const lastOpp = history
    .slice()
    .reverse()
    .find(
      (m) =>
        (personaId === "pro" && m.personaId === "con") ||
        (personaId === "con" && m.personaId === "pro"),
    );

  const responses: Record<PersonaId, string[]> = {
    moderator: [
      `오늘의 주제는 「${t}」입니다. 이 주제에서 무엇을 놓고 토론할지 명확히 하고 시작하겠습니다.`,
      `「${t}」를 둘러싼 논의가 진행 중입니다. 양측 모두 이 주제와 직접 관련된 근거를 대주세요.`,
      `지금까지 「${t}」에 대한 핵심 쟁점이 드러났습니다. 다음 발언에서 상대 주장에 응답해주세요.`,
    ],
    pro: [
      `「${t}」에 대해 긍정적으로 봅니다. 이 주제의 가치와 의미를 구체적으로 설명할 수 있습니다.`,
      lastOpp
        ? `반대 측이 「${t}」를 폄하했지만, 그 관점은 일부만 본 것입니다. ${t}의 긍정적 측면이 더 큽니다.`
        : `「${t}」는 단순해 보여도 충분히 토론할 가치가 있습니다. 긍정적 해석이 가능합니다.`,
      `결국 「${t}」는 긍정적으로 평가할 근거가 더 많습니다.`,
    ],
    con: [
      `「${t}」에 대해 비판적으로 봅니다. 이 주제의 한계와 문제점을 짚어야 합니다.`,
      lastOpp
        ? `찬성 측이 「${t}」를 과대평가합니다. 현실적으로 보면 부정적 측면이 더 분명합니다.`
        : `「${t}」를 그대로 긍정하기 어렵습니다. 다른 관점에서 보면 문제가 보입니다.`,
      `「${t}」에 대한 낙관론은 설득력이 부족합니다.`,
    ],
    neutral: [
      `「${t}」는 해석에 따라 찬반이 갈립니다. 맥락을 함께 봐야 합니다.`,
      `양측 모두 「${t}」의 일부 측면만 강조하고 있습니다. 균형 잡힌 시각이 필요합니다.`,
      `「${t}」에 대한 결론은 단정하기보다 조건부로 접근하는 게 맞습니다.`,
    ],
  };

  return responses[personaId][i];
}

function getMockResponse(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string {
  if (ctx.mode === "versus") {
    return getMockVersusResponse(ctx, personaId, round);
  }
  if (ctx.mode === "proposition") {
    return getMockPropositionResponse(ctx, personaId, round);
  }
  return getMockOpenResponse(ctx, personaId, round, history);
}

function buildPrompt(
  ctx: TopicContext,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string {
  const persona = getPersona(personaId);
  const stance = getPersonaStance(personaId, ctx);
  const historyText = history
    .slice(-8)
    .map((m) => {
      const p = getPersona(m.personaId);
      return `[${p.name}] ${m.content}`;
    })
    .join("\n");

  const modeRules =
    ctx.mode === "versus"
      ? `- 이 토론은 대결 형식입니다. 찬성 AI는 반드시 「${ctx.sideA}」 편, 반대 AI는 반드시 「${ctx.sideB}」 편만 옹호하세요.
- "정책", "규제", "혁신", "사회적 비용" 같은 주제와 무관한 일반론을 쓰지 마세요.
- ${ctx.sideA}와 ${ctx.sideB}의 실력, 성과, 스타일, 영향력 등 주제와 직접 관련된 근거만 사용하세요.`
      : `- 반드시 「${ctx.topic}」라는 주제 자체에만 집중하세요.
- 주제와 무관한 정책·사회 일반론(규제, 혁신, 기회비용 등)을 끌어오지 마세요.
- 이전 발언을 반박하거나 보완할 때도 주제 맥락 안에서만 하세요.`;

  return `당신은 AI 토론 프로그램의 "${persona.name}"입니다.

【토론 주제】「${ctx.topic}」
【토론 형식】${ctx.brief}
【당신의 역할】${stance}
【현재 라운드】${round}

지금까지의 발언:
${historyText || "(아직 발언 없음)"}

필수 규칙:
${modeRules}
- 한국어로 2~4문장, 자연스럽고 설득력 있게 발언하세요.
- 사회자는 토론을 정리하고 다음 논점을 제시하세요.
- 마크다운, 이모지, 인용부호 없이 순수 텍스트만 출력하세요.
- 발언 전체가 주제 「${ctx.topic}」와 직접 관련되어야 합니다.`;
}

export async function generateDebateTurn(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): Promise<string> {
  const ctx = parseTopic(topic);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    await new Promise((r) => setTimeout(r, 500));
    return getMockResponse(ctx, personaId, history, round);
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 한국어 토론 AI입니다. 주어진 주제에서 벗어나는 발언을 하면 실격입니다. 주제와 무관한 정책·경제 일반론을 절대 사용하지 마세요.`,
        },
        {
          role: "user",
          content: buildPrompt(ctx, personaId, history, round),
        },
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return getMockResponse(ctx, personaId, history, round);
    }
    return content;
  } catch {
    return getMockResponse(ctx, personaId, history, round);
  }
}
