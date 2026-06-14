import type { PersonaId } from "./types";
import type { TopicDomain } from "./topic-context";

/** 뻔한 논점 말고 매 라운드 다른 '천재적' 렌즈 */
const NOVEL_LENSES: Record<TopicDomain, string[]> = {
  esports: [
    "손목·부상·컨디션 변수",
    "패치 한두 번에 메타 뒤집히는 속도",
    "대형전 압박 vs 스몰 스크림",
    "팀 이적 직후 성적 꼬리표",
    "상대 카운터픽·밴픽 설계",
    "여론·팬 압력이 플레이에 미치는 영향",
  ],
  food: [
    "혼밥 vs 회식 상황",
    "배달 지연·메뉴 실패 리스크",
    "건강·소화 부담",
    "지역·브랜드 편차",
    "야식 vs 점심 타이밍",
    "가격 인상 후 가성비",
  ],
  tech: [
    "레거시 코드 냄새",
    "채용 시장에서 인력 풀",
    "모바일 vs 데스크톱 타깃",
    "오픈소스 의존성 리스크",
    "AI 코딩 도구와 궁합",
    "3년 뒤 유지보수 비용",
  ],
  entertainment: [
    "첫 인상 vs 재소비 가치",
    "팬덤 문화·밈 확산",
    "해외 반응과 현지성",
    "상업성과 예술성 충돌",
    "시간이 지나며 평가 바뀌는 패턴",
    "플랫폼 알고리즘 영향",
  ],
  social: [
    "저소득·취약계층 영향",
    "세대 차이",
    "도시 vs 지방",
    "제도 없을 때 실제 작동",
    "단기 체감 vs 장기 부작용",
    "개인 자유 vs 집단 이익",
  ],
  science: [
    "실험 재현성",
    "관측 한계·노이즈",
    "용어 정의부터 다른 문제",
    "공학적 구현 가능성",
    "역사적 반례 사례",
    "윤리·안전 가드레일",
  ],
  general: [
    "숨은 전제 깨기",
    "반대편이 안 말한 변수",
    "10년 뒤 시나리오",
    "소수 사례가 전체를 흔드는 경우",
    "비용·시간 제약",
    "직관과 데이터 충돌",
  ],
};

export function pickNovelLens(
  domain: TopicDomain,
  round: number,
  personaId: PersonaId,
): string {
  const pool = NOVEL_LENSES[domain];
  const offset =
    personaId === "atlas" ? 0 : personaId === "cipher" ? 2 : 4;
  const idx = (round - 1 + offset) % pool.length;
  return pool[idx] ?? pool[0];
}

export const FRESHNESS_RULE =
  "뻔한 말·이미 나온 논점 금지. 팩트는 자연스럽게 녹이고 위키·자료 인용 금지. 친구 톤 유지.";
