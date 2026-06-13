/**
 * 토론 주제 경우의수 시뮬레이션
 * 실행: npm run simulate
 */
import { parseTopic, getModeLabel } from "../src/lib/topic-context";
import {
  generateMockTurn,
  validateResponse,
  simulateFullRound,
} from "../src/lib/debate-content";
import { generateDebateTurn } from "../src/lib/llm";
import { resolvePersonaLlmRuntime } from "../src/lib/debate-llm-config";
import type { PersonaId } from "../src/lib/types";

const TEST_TOPICS = [
  // 대결 (versus)
  "페이커vs쵸비",
  "페이커 vs 쵸비",
  "T1 대 GEN",
  "치킨/피자",
  "iPhone vs Android",
  "React vs Vue",

  // 비교 (comparison)
  "페이커가 쵸비보다 낫다",
  "고양이가 개보다 낫다",
  "치킨이 피자보다 맛있다",

  // 찬반 (proposition)
  "인공지능이 일자리를 대체해야 하는가?",
  "원격근무가 좋은가",
  "매일 마라탕을 먹어야 할까",

  // 선택/최고 (choice)
  "역대 최고의 게임은?",
  "가장 맛있는 음식",
  "누가 더 잘하나 페이커 쵸비",

  // 질문 (wh_question)
  "왜 하늘은 파란색인가",
  "어떤 게 더 좋아 삼겹살 초밥",

  // 짧은/캐주얼 (casual)
  "하이",
  "ㅎㅇ",
  "안녕",
  "ㅋㅋ",

  // 단어/주제 (topic)
  "치킨",
  "삼성전자",
  "롤드컵",
  "마인크래프트",

  // 엣지
  "vs",
  "AI",
  "지구는 평평하다",
  "양자 불멸은 실제로 가능할까?",
];

async function main() {
  const useApi = !!process.env.OPENAI_API_KEY;
  const engineLabel = useApi ? "OpenAI" : "Smart Engine + Wiki";
  const generate = useApi
    ? (
        topic: string,
        personaId: PersonaId,
        history: Parameters<typeof generateMockTurn>[2],
        round: number,
      ) =>
        generateDebateTurn(
          topic,
          personaId,
          history,
          round,
          `sim-${topic}`,
          resolvePersonaLlmRuntime(
            {
              id: `sim-${topic}`,
              topic,
              status: "active",
              round,
              maxRounds: 20,
              turnIntervalMs: 8000,
              lastTurnAt: null,
              reportStatus: "none",
              llmMode: "free",
              apiLayout: null,
              apiProvider: null,
              apiModel: null,
              openaiModel: null,
              geminiModel: null,
              maxTokenBudget: 0,
              tokensUsed: 0,
              endReason: null,
              createdAt: "",
              updatedAt: "",
            },
            personaId,
          ),
        ).then((r) => r.content)
    : async (
        topic: string,
        personaId: PersonaId,
        history: Parameters<typeof generateMockTurn>[2],
        round: number,
      ) => {
        const ctx = parseTopic(topic);
        return generateMockTurn(
          ctx,
          personaId,
          history,
          round,
          `sim-${topic}`,
        );
      };

  console.log(`\n=== 토론 시뮬레이션 (${engineLabel}) ===\n`);
  console.log(`테스트 주제: ${TEST_TOPICS.length}개\n`);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const topic of TEST_TOPICS) {
    const { ctx, messages, validations } = await simulateFullRound(
      topic,
      generate,
    );

    const allOk = validations.every((v) => v.ok);
    const status = allOk ? "PASS" : "FAIL";
    if (allOk) passed++;
    else {
      failed++;
      const issues = validations
        .flatMap((v, i) =>
          v.ok ? [] : [`${messages[i].personaId}: ${v.issues.join(",")}`],
        )
        .join("; ");
      failures.push(`[${status}] ${topic} (${getModeLabel(ctx.mode)}) → ${issues}`);
    }

    console.log(
      `[${status}] ${topic.padEnd(28)} | ${getModeLabel(ctx.mode).padEnd(6)} | ${ctx.domain}`,
    );

    if (!allOk) {
      for (const m of messages) {
        const v = validateResponse(ctx, m.personaId, m.content);
        if (!v.ok) {
          console.log(`       ${m.personaId}: ${m.content.slice(0, 60)}...`);
          console.log(`       issues: ${v.issues.join(", ")}`);
        }
      }
    }
  }

  console.log(`\n=== 결과: ${passed}/${TEST_TOPICS.length} PASS, ${failed} FAIL ===\n`);

  if (failures.length > 0) {
    console.log("실패 목록:");
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }

  // 샘플 출력
  console.log("\n=== 샘플: 페이커vs쵸비 ===");
  const sample = await simulateFullRound("페이커vs쵸비", generate);
  for (const m of sample.messages) {
    console.log(`[${m.personaId}] ${m.content}`);
  }

  console.log("\n=== 샘플: 하이 ===");
  const sample2 = await simulateFullRound("하이", generate);
  for (const m of sample2.messages) {
    console.log(`[${m.personaId}] ${m.content}`);
  }

  console.log("\n=== 샘플: 양자 불멸은 실제로 가능할까? ===");
  const sample3 = await simulateFullRound(
    "양자 불멸은 실제로 가능할까?",
    generate,
  );
  for (const m of sample3.messages) {
    console.log(`[${m.personaId}] ${m.content}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
