# AI 토론 아레나

주제를 던지면 AI 4명(찬성, 반대, 중립, 사회자)이 **당신이 보든 말든** 백그라운드에서 계속 토론하는 사이트입니다.

## 핵심 기능

- **백그라운드 토론**: 브라우저를 닫아도 서버가 토론을 이어감
- **실시간 스트리밍**: SSE로 토론을 라이브로 관전 가능
- **토론 기록**: 나중에 돌아와서 전체 대화 확인
- **일시정지/재개/종료**: 토론 제어 가능
- **모의 모드**: OpenAI API 키 없이도 동작 (기본 한국어 토론 템플릿)

## 시작하기

```bash
cd ai-debate-arena
npm install
cp .env.example .env.local   # 선택: OPENAI_API_KEY 설정
npm run dev
```

http://localhost:4000 에서 확인

## OpenAI API 연동 (선택)

`.env.local`에 API 키를 넣으면 실제 AI가 토론합니다:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

키가 없으면 자동으로 모의 토론 모드로 전환됩니다.

## 아키텍처

```
주제 입력 → API → DB 저장 → 백그라운드 워커
                              ↓
                    8초마다 다음 AI 발언 생성
                              ↓
                    SSE로 실시간 전송 (관전 시)
```

- **백그라운드 워커**: `instrumentation.ts`에서 서버 시작 시 자동 실행
- **저장소**: Supabase PostgreSQL (권장) 또는 로컬 `data/debates.json` 폴백
- **AI 페르소나**: 찬성(🟢) / 반대(🔴) / 중립(🔵) / 사회자(🟣)

## Supabase 연동 (토론 영구 저장)

Supabase를 설정하면 토론·발언·타임라인·보고서가 PostgreSQL에 저장됩니다. Render 재배포해도 데이터가 유지됩니다.

### 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) → New Project
2. **SQL Editor**에서 `supabase/schema.sql` 내용 실행

### 2. 환경변수 설정

`.env.local` (로컬) 또는 Render Environment:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Settings → API → service_role
```

> `service_role` 키는 서버 전용입니다. 클라이언트에 노출하지 마세요.

### 3. 동작 확인

`/api/health` 응답에서 `"storage": "supabase"` 확인

Supabase 미설정 시 자동으로 로컬 파일(`data/debates.json`)에 저장됩니다.

## Render 배포

`render.yaml`이 포함되어 있어 Blueprint로 바로 배포할 수 있습니다.

### 1. GitHub에 푸시

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Render에서 배포

1. [render.com](https://render.com) 로그인
2. **New → Blueprint**
3. GitHub repo 연결
4. `render.yaml` 자동 인식 → **Apply**
5. Environment에서 `OPENAI_API_KEY`, Supabase 키 입력

### 3. 수동 배포 (Blueprint 없이)

1. **New → Web Service**
2. Repo 연결
3. 설정:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
5. Environment Variables:
   - `OPENAI_API_KEY` (선택)
   - `OPENAI_MODEL` = `gpt-4o-mini`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### Render 주의사항

| 항목 | 설명 |
|------|------|
| **플랜** | `starter` 이상 권장. Free 플랜은 15분 미사용 시 슬립 → 백그라운드 토론 중단 |
| **저장소** | Supabase 사용 시 Persistent Disk 불필요 |
| **포트** | Render가 `PORT` 환경변수를 자동 주입 — `npm start`가 자동 대응 |
| **리전** | `render.yaml` 기본값 `singapore`. 필요 시 `oregon`, `frankfurt` 등으로 변경 |

## 배포 시 주의 (기타)

Vercel 같은 서버리스 환경에서는 백그라운드 워커가 제한됩니다.
진짜 24/7 토론을 원하면 Render, Railway, VPS 등 **항상 켜져 있는 서버**에 배포하세요:

```bash
npm run build
npm start
```

## 커스터마이징

- `src/lib/personas.ts` — AI 캐릭터 수정
- `src/lib/llm.ts` — 프롬프트 / 모의 응답 수정
- `turnIntervalMs` (기본 8초) — 발언 간격 조절
- `maxRounds` (기본 20) — 최대 라운드 수
