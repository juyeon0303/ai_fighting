import OpenAI from "openai";
import type { DebateMessage, PersonaId } from "./types";
import { getPersona } from "./personas";

const MOCK_RESPONSES: Record<PersonaId, string[]> = {
  moderator: [
    "오늘의 주제, '{topic}'에 대해 열띤 토론을 시작하겠습니다. 각 참가자는 자신의 입장을 명확히 밝혀주세요.",
    "지금까지 흥미로운 논점들이 나왔습니다. 찬성 측, 반대 측 모두 핵심을 짚었는데, 한 단계 더 깊이 파고들어 보죠.",
    "양측 모두 설득력 있는 근거를 제시했습니다. 이제 청중이 판단할 차례입니다. 다음 라운드로 넘어가겠습니다.",
  ],
  pro: [
    "'{topic}'은 분명히 긍정적입니다. 역사적으로도 혁신은 항상 저항을 받았지만, 결국 인류에게 이득이 되었습니다.",
    "반대 측의 우려는 이해하지만, 적절한 규제와 함께라면 리스크는 충분히 관리 가능합니다. 기회비용을 생각해보세요.",
    "데이터가 말해줍니다. 유사한 사례에서 긍정적 결과가 압도적이었습니다. 우리는 변화를 두려워하지 말아야 합니다.",
  ],
  con: [
    "'{topic}'에 대해 신중해야 합니다. 겉으로 보이는 이점 뒤에 숨겨진 부작용과 사회적 비용을 간과해서는 안 됩니다.",
    "찬성 측의 낙관론은 너무 이상적입니다. 현실에서는 예상치 못한 부정적 결과가 항상 따라옵니다.",
    "단기적 편익을 위해 장기적 안정을 희생하는 것은 현명하지 않습니다. 더 철저한 검증이 필요합니다.",
  ],
  neutral: [
    "'{topic}'은 양면성이 뚜렷합니다. 찬성과 반대 모두 타당한 지점이 있으니, 맥락에 따라 답이 달라질 수 있습니다.",
    "핵심은 '누구에게, 언제, 어떤 조건에서'인 것 같습니다. 일률적 찬반이 아니라 조건부 접근이 필요합니다.",
    "양측 논리를 종합하면, 점진적 도입과 지속적 모니터링이 가장 합리적인 중도안으로 보입니다.",
  ],
};

function getMockResponse(topic: string, personaId: PersonaId, round: number): string {
  const templates = MOCK_RESPONSES[personaId];
  const template = templates[round % templates.length];
  return template.replaceAll("{topic}", topic);
}

function buildPrompt(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): string {
  const persona = getPersona(personaId);
  const historyText = history
    .slice(-8)
    .map((m) => {
      const p = getPersona(m.personaId);
      return `[${p.name}] ${m.content}`;
    })
    .join("\n");

  return `당신은 AI 토론 프로그램의 "${persona.name}"(${persona.role})입니다.

토론 주제: "${topic}"
현재 라운드: ${round}

지금까지의 발언:
${historyText || "(아직 발언 없음)"}

규칙:
- 한국어로 2~4문장, 자연스럽고 설득력 있게 발언하세요.
- 이전 발언을 반박하거나 보완하세요.
- 사회자는 토론을 정리하고 다음 논점을 제시하세요.
- 찬성/반대/중립은 각자의 입장을 유지하세요.
- 마크다운, 이모지, 인용부호 없이 순수 텍스트만 출력하세요.`;
}

export async function generateDebateTurn(
  topic: string,
  personaId: PersonaId,
  history: DebateMessage[],
  round: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    await new Promise((r) => setTimeout(r, 500));
    return getMockResponse(topic, personaId, round);
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: buildPrompt(topic, personaId, history, round),
        },
      ],
      max_tokens: 300,
      temperature: 0.85,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return getMockResponse(topic, personaId, round);
    }
    return content;
  } catch {
    return getMockResponse(topic, personaId, round);
  }
}
