/**
 * 토론 주제 파싱 + 프롬프트 구조 검증
 * 실행: npm run simulate
 */
import { parseTopic, getModeLabel } from "../src/lib/topic-context";
import { buildDebatePrompt } from "../src/lib/debate-content";
import { DEBATE_TURN_ORDER } from "../src/lib/personas";
import type { DebateMessage } from "../src/lib/types";

const TEST_TOPICS = [
  "페이커vs쵸비",
  "페이커 vs 쵸비",
  "T1 대 GEN",
  "치킨/피자",
  "iPhone vs Android",
  "React vs Vue",
  "페이커가 쵸비보다 낫다",
  "고양이가 개보다 낫다",
  "치킨이 피자보다 맛있다",
  "인공지능이 일자리를 대체해야 하는가?",
  "원격근무가 좋은가",
  "매일 마라탕을 먹어야 할까",
  "역대 최고의 게임은?",
  "가장 맛있는 음식",
  "누가 더 잘하나 페이커 쵸비",
  "왜 하늘은 파란색인가",
  "어떤 게 더 좋아 삼겹살 초밥",
  "하이",
  "ㅎㅇ",
  "안녕",
  "ㅋㅋ",
  "치킨",
  "삼성전자",
  "롤드컵",
  "마인크래프트",
  "vs",
  "AI",
  "지구는 평평하다",
  "양자 불멸은 실제로 가능할까?",
  "동양 vs 서양",
];

function main() {
  console.log("\n=== 토론 시뮬레이션 (프롬프트 구조) ===\n");
  console.log(`테스트 주제: ${TEST_TOPICS.length}개\n`);

  let passed = 0;
  let failed = 0;

  for (const topic of TEST_TOPICS) {
    try {
      const ctx = parseTopic(topic);
      const messages: DebateMessage[] = [];

      for (const personaId of DEBATE_TURN_ORDER) {
        const prompt = buildDebatePrompt(ctx, personaId, messages, 1, "gemini");
        if (!prompt.includes(ctx.topic)) {
          throw new Error("prompt missing topic");
        }
        if (prompt.length < 20) {
          throw new Error("prompt too short");
        }
        messages.push({
          id: `sim-${personaId}`,
          debateId: "sim",
          personaId,
          content: "테스트 발언",
          round: 1,
          createdAt: new Date().toISOString(),
        });
      }

      passed++;
      console.log(
        `[PASS] ${topic.padEnd(28)} | ${getModeLabel(ctx.mode).padEnd(6)} | ${ctx.domain}`,
      );
    } catch (err) {
      failed++;
      console.log(`[FAIL] ${topic} → ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n=== 결과: ${passed}/${TEST_TOPICS.length} PASS, ${failed} FAIL ===\n`);

  if (failed > 0) process.exit(1);

  const ctx = parseTopic("동양 vs 서양");
  console.log("=== 샘플 프롬프트 (동양 vs 서양 / GE) ===\n");
  console.log(buildDebatePrompt(ctx, "atlas", [], 1, "gemini"));
}

main();
