import type { DebateMessage } from "./types";

export interface GroundTruthEntity {
  /** 표시 이름 */
  label: string;
  aliases: string[];
  /** 위키 검색 우선 제목 */
  wikiTitles: { ko?: string; en?: string };
  /** 토론에 쓸 짧은 검증 팩트 */
  cues: string[];
  /** 이 선수에게 붙이면 안 되는 표현 */
  forbidden: RegExp[];
}

const ESPORTS_ENTITIES: GroundTruthEntity[] = [
  {
    label: "페이커",
    aliases: ["faker", "이상혁", "lee sang-hyeok"],
    wikiTitles: { ko: "페이커", en: "Faker (gamer)" },
    cues: [
      "T1 미드라이너",
      "롤드컵 6회 우승(2013·2015·2016·2023·2024·2025)",
      "2023~2025 월드 3연패",
      "2013 데뷔 후 한 팀 장기 활약",
      "손목 부상 뒤에도 복귀해 우승",
    ],
    forbidden: [/gen\.?g/i, /젠지/],
  },
  {
    label: "쵸비",
    aliases: ["chovy", "정지훈", "jeong ji-hoon"],
    wikiTitles: { ko: "쵸비", en: "Chovy (gamer)" },
    cues: [
      "Gen.G 미드라이너",
      "LCK 정규시즌 통계·라인전 지표 상위권",
      "월드 우승 경력은 아직 없음",
      "팀 운영·오브젝트 교환에서 성장세",
      "스몰 스크림·개인 기량형 플레이에 강점",
    ],
    forbidden: [/t1/i, /티원/, /sk\s*텔레콤/i],
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").trim();
}

export function matchGroundTruth(name: string): GroundTruthEntity | null {
  const n = norm(name);
  for (const entity of ESPORTS_ENTITIES) {
    if (norm(entity.label) === n) return entity;
    if (entity.aliases.some((a) => norm(a) === n)) return entity;
    if (n.includes(norm(entity.label))) return entity;
    if (entity.aliases.some((a) => n.includes(norm(a)))) return entity;
  }
  return null;
}

export function wikiTitleForEntity(name: string): string | null {
  const entity = matchGroundTruth(name);
  if (!entity) return null;
  return entity.wikiTitles.ko ?? entity.wikiTitles.en ?? null;
}

function cueUsed(cue: string, history: DebateMessage[]): boolean {
  const key = cue.replace(/\s+/g, " ").trim().slice(0, 14).toLowerCase();
  if (key.length < 6) return false;
  const blob = history.map((m) => m.content).join(" ").toLowerCase();
  return blob.includes(key);
}

/** 검증된 짧은 팩트 — 위키 대신 우선 사용 */
export function pickGroundTruthCue(
  name: string,
  history: DebateMessage[],
  seed: number,
): string | null {
  const entity = matchGroundTruth(name);
  if (!entity) return null;

  for (let i = 0; i < entity.cues.length; i++) {
    const cue = entity.cues[(seed + i) % entity.cues.length];
    if (!cueUsed(cue, history)) return cue;
  }
  return entity.cues[seed % entity.cues.length] ?? null;
}

export function factViolatesGroundTruth(
  entityName: string,
  fact: string,
): boolean {
  const entity = matchGroundTruth(entityName);
  if (!entity) return false;
  return entity.forbidden.some((re) => re.test(fact));
}

export function speechViolatesGroundTruth(
  sideName: string,
  content: string,
): boolean {
  const entity = matchGroundTruth(sideName);
  if (!entity) return false;
  return entity.forbidden.some((re) => re.test(content));
}
