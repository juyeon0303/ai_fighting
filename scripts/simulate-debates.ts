/**
 * 토론 주제 파싱 + 멀티턴 프롬프트 구조 검증
 * 실행: npm run simulate
 */
import { parseTopic, getModeLabel } from "../src/lib/topic-context";
import { buildGeminiContents } from "../src/lib/debate-content";
import { isTurnComplete } from "../src/lib/debate-turn-budget";
import { canAppendTurn, DEBATE_TURN_ORDER } from "../src/lib/personas";
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
  console.log("\n=== 토론 시뮬레이션 (멀티턴 구조) ===\n");
  console.log(`테스트 주제: ${TEST_TOPICS.length}개\n`);

  const turnCases: Array<[string, boolean]> = [
    ["근데 붕어빵처럼 각각 다른 존재라고 단정 짓", false],
    ["(Metaphor of hot bath vs cold splash):* 그치만 그 붕 뜨는", false],
    ["그건 좀 맞는 말이야.", true],
    ["그렇지, 그건 핵심이야.", true],
    ["완전히 다른 거라고 단정", false],
    ["솔직히 잘 모르겠는데", true],
  ];
  for (const [text, ok] of turnCases) {
    const got = isTurnComplete(text);
    if (got !== ok) {
      console.error(`[FAIL] turn complete: "${text}" expected ${ok}, got ${got}`);
      process.exit(1);
    }
  }
  console.log("[PASS] turn completeness checks\n");

  const corrupt: DebateMessage[] = [
    {
      id: "c1",
      debateId: "sim",
      personaId: "atlas",
      content: "a",
      round: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "c2",
      debateId: "sim",
      personaId: "ember",
      content: "b",
      round: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "c3",
      debateId: "sim",
      personaId: "cipher",
      content: "c",
      round: 1,
      createdAt: new Date().toISOString(),
    },
  ];
  if (!canAppendTurn(corrupt, "atlas")) {
    throw new Error("corrupt history must allow count-based recovery (atlas)");
  }
  console.log("[PASS] turn slot recovery after order skew\n");

  let passed = 0;
  let failed = 0;

  for (const topic of TEST_TOPICS) {
    try {
      const ctx = parseTopic(topic);
      const messages: DebateMessage[] = [];

      for (const personaId of DEBATE_TURN_ORDER) {
        const contents = buildGeminiContents(
          ctx.topic,
          messages,
          personaId,
          "gemini",
        );
        if (
          !contents[0]?.text.includes(ctx.displayTopic) &&
          !contents[0]?.text.includes(ctx.topic)
        ) {
          throw new Error("opening missing topic");
        }
        const last = contents[contents.length - 1];
        if (last.role !== "user") {
          throw new Error("last turn must be user nudge");
        }
        const selfModels = contents.filter((c) => c.role === "model").length;
        const selfMessages = messages.filter(
          (m) => m.personaId === personaId,
        ).length;
        if (selfModels !== selfMessages) {
          throw new Error(
            `model turns ${selfModels} != own history ${selfMessages}`,
          );
        }
        if (contents.length < 1) {
          throw new Error("contents empty");
        }
        messages.push({
          id: `sim-${personaId}`,
          debateId: "sim",
          personaId,
          content: "테스트 발언입니다.",
          round: 1,
          createdAt: new Date().toISOString(),
          llmSource: "gemini",
        });
      }

      const fullRound = buildGeminiContents(
        ctx.topic,
        messages,
        "cipher",
        "gemini",
      );
      const geUser = fullRound.find((c) => c.text.startsWith("[자]:"));
      const miModel = fullRound.filter((c) => c.role === "model");
      if (!geUser || geUser.role !== "user") {
        throw new Error("자 line must be user with speaker label");
      }
      if (miModel.length !== 1 || !miModel[0]?.text.includes("테스트")) {
        throw new Error("강 should have exactly one model turn (self)");
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

  console.log("=== 샘플: 페이커 vs 쵸비 / 자 차례 ===\n");
  const history: DebateMessage[] = DEBATE_TURN_ORDER.map((id, i) => ({
    id: `h-${id}`,
    debateId: "sim",
    personaId: id,
    content: `테스트 발언 ${i + 1}`,
    round: 1,
    createdAt: new Date().toISOString(),
    llmSource: "gemini" as const,
  }));
  const sample = buildGeminiContents("페이커 vs 쵸비", history, "atlas", "gemini");
  for (const c of sample) {
    console.log(`[${c.role}] ${c.text.slice(0, 120)}${c.text.length > 120 ? "…" : ""}`);
  }
}

main();
