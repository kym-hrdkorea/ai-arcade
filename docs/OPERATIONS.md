# OPERATIONS.md — 행사 운영 및 배포 체크리스트

## 0. 외부 플레이 가능 환경

### 0-1. 현재 구조 진단

현재 저장소는 pnpm workspace 기반 모노레포다.

- `apps/web`: Next.js App Router 웹 앱이다. Vercel 배포 대상이다.
- `apps/realtime-server`: Socket.IO 장기 연결 Node 서버다. Vercel Functions 단독 배포 대상이 아니다.
- `packages/shared`: web과 realtime-server가 함께 쓰는 타입과 이벤트 payload다.
- `packages/qr-code`: 외부 QR API 없이 로컬에서 QR을 생성하는 패키지다.
- `apps/realtime-server`는 `/health` HTTP endpoint를 제공한다.

배포 전 기준선:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

실시간 서버 스모크:

```bash
LOAD_SMOKE_CLIENTS=20 LOAD_SMOKE_ROOMS=4 pnpm --filter realtime-server load:smoke
```

Real or AI 100명 한 방 스모크:

PowerShell:

```powershell
$env:LOAD_SMOKE_GAME="real-or-ai"
$env:LOAD_SMOKE_CLIENTS="100"
$env:LOAD_SMOKE_ROOMS="1"
pnpm --filter realtime-server load:smoke
```

macOS/Linux shell:

```bash
LOAD_SMOKE_GAME=real-or-ai LOAD_SMOKE_CLIENTS=100 LOAD_SMOKE_ROOMS=1 pnpm --filter realtime-server load:smoke
```

판단 기준:

- 첫 외부 접속 성공은 `ngrok` 임시 공개로 확인한다.
- 계속 공유할 URL이 필요하면 `Vercel(web) + Render(realtime-server)`를 기본 추천으로 둔다.
- Render가 맞지 않으면 Fly.io 또는 Railway를 검토한다.
- 실제 AI 비용을 막기 위해 배포 기본값은 `DRAW_DUEL_AI_PROVIDER=mock`으로 둔다.
- 100명 동시 접속은 보장하지 않는다. 행사 전 네트워크와 부하 스모크로 위험을 기록한다.

참고 공식 문서:

- [Vercel WebSocket KB](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- [Vercel Monorepos](https://vercel.com/docs/monorepos)
- [ngrok HTTP/S Endpoints](https://ngrok.com/docs/universal-gateway/http)
- [Render Web Services](https://render.com/docs/web-services)
- [Render Health Checks](https://render.com/docs/health-checks)

### 0-2. 빠른 테스트용 ngrok 공개

ngrok 리허설은 진행자 PC에서 web과 realtime-server를 켜 둔 채 외부 HTTPS URL만 잠깐 여는 방식이다. PC가 꺼지거나 로컬 서버가 종료되면 게임도 종료된다.

1. 의존성을 설치한다.

```bash
pnpm install
```

2. 먼저 로컬 서버가 정상인지 확인한다.

```bash
pnpm dev
```

브라우저에서 아래 주소가 열려야 한다.

- Web: `http://localhost:3000`
- Realtime health: `http://localhost:4000/health`

3. 새 터미널 2개를 열어 ngrok 터널을 만든다.

```bash
ngrok http 3000
```

```bash
ngrok http 4000
```

4. ngrok이 보여주는 HTTPS URL 2개를 기록한다.

```txt
web ngrok URL: https://<web-ngrok-url>
realtime ngrok URL: https://<realtime-ngrok-url>
```

5. `pnpm dev`를 중지한 뒤, 같은 터미널에서 환경변수를 넣고 다시 시작한다.

PowerShell:

```powershell
$env:NEXT_PUBLIC_REALTIME_URL="https://<realtime-ngrok-url>"
$env:CORS_ORIGIN="https://<web-ngrok-url>"
$env:DRAW_DUEL_AI_PROVIDER="mock"
pnpm dev
```

macOS/Linux shell:

```bash
NEXT_PUBLIC_REALTIME_URL="https://<realtime-ngrok-url>" \
CORS_ORIGIN="https://<web-ngrok-url>" \
DRAW_DUEL_AI_PROVIDER="mock" \
pnpm dev
```

6. 외부 참가자에게는 web ngrok URL만 공유한다.

```txt
https://<web-ngrok-url>
```

7. 참가자 테스트 체크리스트를 진행한다.

```txt
[ ] 외부 기기 또는 모바일 데이터로 web URL 접속
[ ] 방 만들기
[ ] 호스트 운영 패널의 QR 표시
[ ] QR로 모바일 참가
[ ] 드로잉 실시간 반영
[ ] 정답 제출
[ ] 라운드 결과 표시
[ ] 최종 결과 화면 표시
[ ] 새로고침 후 60초 안 재접속 복구
[ ] 방 리셋
```

ngrok 한계:

- 무료/임시 URL은 재시작 시 바뀔 수 있다.
- 진행자 PC, 로컬 서버, ngrok 프로세스가 꺼지면 접속도 끊긴다.
- 실제 행사 전에는 안정 배포 또는 고정 도메인을 검토한다.
- ngrok URL이 바뀌면 `NEXT_PUBLIC_REALTIME_URL`과 `CORS_ORIGIN`을 바꿔 로컬 서버를 다시 시작한다.

### 0-3. 안정 배포 권장안

권장 구성:

```txt
Vercel
  apps/web
  NEXT_PUBLIC_REALTIME_URL=https://<realtime-server-url>

Render
  apps/realtime-server
  CORS_ORIGIN=https://<vercel-web-url>
  DRAW_DUEL_AI_PROVIDER=mock
```

배포 순서:

1. GitHub에 저장소를 push한다.
2. Render에 realtime-server를 먼저 만든다.
3. Render에서 발급된 URL의 `/health`가 200인지 확인한다.
4. Vercel에 web을 만들고 `NEXT_PUBLIC_REALTIME_URL`에 Render URL을 넣는다.
5. Vercel 배포가 끝나면 Render의 `CORS_ORIGIN`을 Vercel URL로 바꾼다.
6. Vercel URL에서 방 만들기와 Socket.IO 연결을 확인한다.

#### Vercel web 설정

Vercel에는 `apps/web`만 배포한다.

```txt
Framework Preset: Next.js
Root Directory: apps/web
Install Command: pnpm install --frozen-lockfile
Build Command: pnpm build
Output Directory: .next
```

환경변수:

```txt
NEXT_PUBLIC_REALTIME_URL=https://<realtime-server-url>
```

주의:

- `NEXT_PUBLIC_REALTIME_URL`은 Next.js 클라이언트 번들에 들어간다. realtime URL을 바꾸면 Vercel web을 다시 배포한다.
- API 키는 Vercel web 환경변수에 넣지 않는다.
- Vercel Preview URL까지 realtime CORS에 허용하려면 현재 서버의 `CORS_ORIGIN` 정책 확장이 필요하다. 지금은 운영 URL 1개를 기준으로 둔다.

#### Render realtime-server 설정

초보자용 기본 선택지는 Render Web Service다. Render는 WebSocket 연결을 지원하고, Web Service는 public HTTP server를 `PORT` 환경변수에 맞춰 `0.0.0.0`에 bind하는 방식을 권장한다.

```txt
Service Type: Web Service
Runtime: Node
Root Directory: .
Build Command: pnpm install --frozen-lockfile && pnpm --filter @ai-arcade/shared build && pnpm --filter realtime-server build
Start Command: pnpm --filter realtime-server start
Health Check Path: /health
```

환경변수:

```txt
NODE_ENV=production
CORS_ORIGIN=https://<vercel-web-url>
DRAW_DUEL_AI_PROVIDER=mock
DISCONNECT_GRACE_MS=60000
REALTIME_HOST=0.0.0.0
```

포트:

- Render가 제공하는 `PORT`를 서버가 자동으로 읽는다.
- `REALTIME_PORT`는 특별한 이유가 있을 때만 override한다.

배포 후 확인:

```txt
https://<render-service-url>/health
```

정상 응답 예시:

```json
{"ok":true,"service":"ai-arcade-realtime-server","rooms":0}
```

#### Fly.io 또는 Railway를 고를 때

Fly.io:

- `fly.toml`의 `internal_port`와 서버 port를 맞춘다.
- 서버는 `0.0.0.0`에 listen해야 한다.
- `/health` HTTP check를 별도로 둔다.

Railway:

- Railway가 제공하는 `PORT`를 사용한다.
- public domain을 발급한 뒤 Vercel의 `NEXT_PUBLIC_REALTIME_URL`과 realtime의 `CORS_ORIGIN`을 서로 맞춘다.

둘 다 기본 환경변수는 Render와 같다.

### 0-4. 업데이트 후 재배포 루틴

기능 수정 후:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

필요 시 realtime-server가 떠 있는 상태에서:

```bash
LOAD_SMOKE_CLIENTS=20 LOAD_SMOKE_ROOMS=4 pnpm --filter realtime-server load:smoke
```

배포 루틴:

1. 로컬에서 수정한다.
2. 검증 명령을 통과시킨다.
3. GitHub에 push한다.
4. Render realtime-server 자동 배포를 확인한다.
5. Vercel web 자동 배포를 확인한다.
6. `https://<realtime-server-url>/health`를 확인한다.
7. Vercel URL에서 방 만들기, QR 참가, 드로잉, 정답, 결과 화면을 확인한다.
8. realtime URL이 바뀌었으면 Vercel의 `NEXT_PUBLIC_REALTIME_URL`을 갱신하고 web을 다시 배포한다.
9. web URL이 바뀌었으면 realtime-server의 `CORS_ORIGIN`을 갱신하고 realtime-server를 다시 배포 또는 재시작한다.

운영 스모크 기록:

```bash
LOAD_SMOKE_CLIENTS=20 LOAD_SMOKE_ROOMS=4 pnpm --filter realtime-server load:smoke
```

Real or AI 스모크:

```bash
LOAD_SMOKE_GAME=real-or-ai LOAD_SMOKE_CLIENTS=100 LOAD_SMOKE_ROOMS=1 pnpm --filter realtime-server load:smoke
```

이 결과는 행사 전 위험 확인용이다. 100명 운영 가능성을 단정하는 근거로 쓰지 않는다.

## 1. 행사 전 확인

```txt
[ ] 배포 URL 접속 가능
[ ] 모바일 접속 가능
[ ] 호스트 운영 패널 안의 QR 접힘/확대 모달 정상 동작
[ ] 방 만들기 가능
[ ] 방 참가 가능
[ ] 호스트 게임 설정 변경 가능
[ ] 게스트 설정 read-only 표시 확인
[ ] 실시간 그림 공유 가능
[ ] 정답 입력 가능
[ ] 결과 화면 정상 표시
[ ] 호스트 라운드 스킵 확인
[ ] 호스트 방 리셋 확인
[ ] 새로고침 후 60초 안 재접속 복구 확인
[ ] 예비 진행 시나리오 준비
```

## 2. 네트워크 확인

- 행사장 Wi-Fi 동시 접속 가능 인원 확인
- 외부망 접속 차단 여부 확인
- 모바일 데이터 접속 대안 준비
- 사내망에서 WebSocket 차단 여부 확인
- 프로젝터 PC와 참가자 모바일이 같은 서비스에 접속 가능한지 확인

## 3. 진행자 안내 멘트 예시

```txt
지금부터 AI Arcade 그림 맞추기 게임을 진행하겠습니다.
화면의 QR코드를 휴대폰으로 찍고 닉네임을 입력해 주세요.
한 명이 제시어를 보고 그림을 그리면, 나머지 분들과 AI가 동시에 정답을 맞히는 방식입니다.
그림은 잘 그릴 필요가 없습니다. 오히려 단순하고 빠르게 그리는 것이 더 재미있습니다.
```

## 4. 장애 대응

### 참가자가 입장하지 못함

- QR 대신 URL 직접 안내
- 방 코드 직접 입력 안내
- 모바일 데이터 전환 안내

### 그림이 보이지 않음

- 같은 브라우저에서 새로고침 안내
- 60초 안에 복구되지 않으면 방 코드로 재입장 안내
- 방 재입장 안내
- 호스트 방 리셋

### 게임이 멈춤

- 호스트가 라운드 스킵
- 호스트가 방 리셋
- 새 방 생성
- 기존 방 종료 안내

### AI 추측이 나오지 않음

- Mock AI 모드로 전환
- AI 없이 인간 대결 모드로 진행

## 5. Phase 6 운영 기능

현재 제공:

1. QR 입장: 호스트 운영 패널의 접힘 UI에서 참가 URL과 QR을 공유하고, 확대 모달로 크게 보여준다.
2. 게임 설정: 호스트가 시작 전 출제자 방식, 최대 라운드, 라운드 시간을 선택한다.
3. 라운드 스킵: 현재 drawing 라운드를 `operator-skip`으로 종료한다.
4. 방 리셋: 같은 방 코드와 설정을 유지하고 대기 상태로 되돌린다.
5. 재접속 복구: 같은 브라우저에서 60초 안에 현재 방과 공개 라운드 상태를 복구한다.

제공하지 않음:

- 로그인/관리자 계정
- 전체 방 목록 운영자 대시보드
- 참가자 강퇴
- Redis adapter
- DB 저장 복구

## 6. 개인정보·보안

- 실명 입력을 요구하지 않음
- 닉네임만 사용
- 결과 저장 시 최소 정보만 저장
- 외부 AI API 사용 시 이미지 데이터 처리 방침 확인
- 행사 사진·화면 캡처 공유 전 내부 기준 확인

## 6-1. Phase 7 실제 AI 그림 추측 운영 원칙

실제 AI provider는 기본 운영값이 아니라 리허설에서 검증한 뒤 켠다.

체크리스트:

```txt
[ ] 기본 provider가 mock인지 확인
[ ] 실제 provider API 키가 서버 환경변수에만 있는지 확인
[ ] 클라이언트 번들에 API 키 또는 provider secret이 없는지 확인
[ ] 외부 AI request에 정답 단어 또는 aliases가 직접 포함되지 않는지 확인
[ ] AI 호출이 라운드당 1회로 제한되는지 확인
[ ] timeout 또는 provider 장애 시 게임 진행이 유지되는지 확인
[ ] 원본 그림 이미지 저장 여부와 보관 정책을 사전에 승인받았는지 확인
[ ] provider 비용과 latency를 리허설 기록에 남겼는지 확인
```

실제 provider 리허설 기록:

```txt
날짜/장소:
Provider:
평균 AI 응답 시간:
최대 AI 응답 시간:
AI 호출 수:
AI 오류/timeout 수:
예상 비용:
정답 단어 prompt 누출 점검:
스킵/리셋/재접속 회귀 이상 여부:
다음 행사 전 수정 필요:
```

## 10. Real or AI Final UX 운영 체크

권장 설정:

- 일반 최종 테스트: 보기 시간 45초
- 긴 비교 게임: 보기 시간 60초
- 빠른 회귀 테스트: 보기 시간 5초, 준비 시간 3초, 1라운드

방장 운영 체크리스트:

- 대기 상태에서만 라운드 수, 보기 시간, 준비 시간을 바꾼다.
- 게임 시작 후 설정 요약이 잠금 상태로 보이는지 확인한다.
- 운영 패널에서 현재 라운드, 남은 시간, 제출 인원이 읽히는지 확인한다.
- 진행 중에는 라운드 스킵과 방 리셋만 필요한 순간에 사용한다.
- 라운드 결과 후 다음 진행 버튼으로 다음 라운드 또는 최종 랭킹으로 넘어간다.
- 방 리셋 뒤 방 코드와 설정은 유지되고 점수, 라운드, 제출 상태는 초기화되는지 확인한다.
- 참가자 화면에 `mock`, `provider`, `asset phase` 같은 개발 용어가 보이지 않는지 확인한다.

돋보기 QA:

- 데스크톱에서 후보 이미지 위로 포인터를 움직이면 inline lens가 실제 이미지 영역만 확대한다.
- 이미지 여백 영역에 포인터가 있을 때 lens가 잘못된 배경을 보여주지 않는다.
- 확대 모달은 1x, 2x, 4x 전환이 되고 기본값은 2x다.
- 2x/4x에서 드래그 pan이 동작하고 Escape 또는 닫기 버튼으로 닫힌다.
- 확대 UI에 `sourceType`, `correctCandidateId` 같은 정답 메타데이터가 렌더링되지 않는다.

모바일 확인 항목:

- 후보 A/B 카드, 확대 버튼, 제출 버튼이 세로 화면에서 겹치지 않는다.
- 터치 환경에서는 inline hover lens 대신 확대 버튼과 모달로 확인한다.
- 확대 모달이 390px 너비 viewport 안에 들어오고 닫기 버튼에 접근할 수 있다.

새 창 테스트 서버 재시작:

```bash
pnpm dev
```

E2E 전용 서버는 Playwright가 `playwright.config.ts`의 webServer 설정으로 재시작한다.

```bash
pnpm e2e -- e2e/ux-public-beta.spec.ts -g "Real or AI"
pnpm e2e
```

## 7. 파일럿 테스트 기준

1차 테스트:

```txt
대상: 내부 5명
목적: 기본 기능 확인
필수 기록:
- 날짜/장소:
- 접속 기기:
- QR 입장 성공:
- 모바일 드로잉 성공:
- 재접속 복구 성공:
- 발견 이슈:
```

2차 테스트:

```txt
대상: 내부 20명
목적: 실시간 안정성 확인
권장 스모크:
LOAD_SMOKE_CLIENTS=20 LOAD_SMOKE_ROOMS=4 pnpm --filter realtime-server load:smoke
필수 기록:
- 날짜/장소:
- 네트워크:
- 실제 참가자 수:
- 방 수:
- 평균 체감 지연:
- WebSocket/접속 오류:
- 운영 패널 스킵/리셋 사용 여부:
- 발견 이슈:
```

3차 테스트:

```txt
대상: 실제 행사 환경 30~50명
목적: 네트워크와 진행 흐름 확인
권장 스모크:
LOAD_SMOKE_CLIENTS=50 LOAD_SMOKE_ROOMS=5 pnpm --filter realtime-server load:smoke
필수 기록:
- 날짜/장소:
- 행사장 Wi-Fi/모바일 데이터:
- 실제 참가자 수:
- QR 입장 실패 수:
- 방 참가 실패 수:
- 드로잉 지연/누락:
- 재접속 복구 성공/실패:
- 호스트 이탈 또는 host 이전 테스트:
- 최종 결과 표시 성공:
- 다음 행사 전 수정 필요:
```

100명 이상 운영은 별도 부하 테스트 후 판단한다.

## 8. 부하 스모크

로컬 realtime-server 실행 후 다음 명령으로 Socket.IO 스모크를 실행한다.

```bash
pnpm --filter realtime-server load:smoke
```

기본 시나리오:

- 100 clients
- 10 rooms
- room당 10명
- 방 생성/참가/게임 시작
- 일부 stroke/guess 이벤트 송신

Real or AI 시나리오:

- `LOAD_SMOKE_GAME=real-or-ai`
- 100 clients
- 1 room
- 방 생성/99명 참가/설정 1라운드/게임 시작
- countdown 이후 후보 public payload 수신
- 100명 answer submit
- round result 수신과 event error 확인

기록 기준:

- 평균 연결 성공률
- 이벤트 오류 수
- 서버 로그 예외 여부
- 눈에 띄는 지연/타임아웃

이 결과는 “100명 보장”이 아니라 “100명 가정 스모크 결과”로만 본다.

최근 로컬 기록:

```txt
2026-05-14 로컬 스모크
Target: http://localhost:4000
Requested clients: 100
Connected clients: 100
Connection success rate: 100.0%
Rooms created: 10
Rooms started: 10
Event errors: 0
Elapsed: 478ms
Server log: 예외 없음. disconnect grace period 동안 rooms=10으로 보였고 60초 만료 후 rooms=0 정리 확인.

2026-05-14 Phase 6.5 로컬 스모크
Target: http://localhost:4000
Requested clients: 20
Connected clients: 20
Connection success rate: 100.0%
Rooms created: 4
Rooms started: 4
Event errors: 0
Elapsed: 199ms

2026-05-14 Phase 6.5 로컬 스모크
Target: http://localhost:4000
Requested clients: 50
Connected clients: 50
Connection success rate: 100.0%
Rooms created: 5
Rooms started: 5
Event errors: 0
Elapsed: 266ms

2026-05-19 Real or AI Phase 7 로컬 스모크
Target: http://127.0.0.1:4207
Requested clients: 100
Requested rooms: 1
Connected clients: 100
Connection success rate: 100.0%
Rooms created: 1
Rooms started: 1
Answer submissions: 100
Event errors: 0
Elapsed: 4199ms
Note: 100명 운영 보장이 아니라 로컬 단일 프로세스 기준 스모크 결과로만 기록한다.
```

## 9. Phase 7 실제 OpenAI Vision 리허설

기본 운영값은 계속 `DRAW_DUEL_AI_PROVIDER=mock`이다. 실제 provider 리허설은 루트 `C:\ai-arcade\.env`에만 아래 값을 설정한 별도 로컬 또는 스테이징 환경에서 진행한다. OpenAI API key는 클라이언트 번들 또는 `NEXT_PUBLIC_*` 환경변수에 넣지 않는다.

```bash
DRAW_DUEL_AI_PROVIDER=openai
OPENAI_API_KEY=...
DRAW_DUEL_AI_MODEL=gpt-5
DRAW_DUEL_AI_TIMEOUT_MS=15000
DRAW_DUEL_AI_DETAIL=high
DRAW_DUEL_AI_REASONING_EFFORT=low
DRAW_DUEL_AI_RETRY_LIMIT=0
```

30개 deterministic stroke fixture 기준 리허설:

```bash
pnpm --filter realtime-server ai:bench
```

- `.env`에 `OPENAI_API_KEY`가 없으면 호출 없이 종료한다.
- 키가 있으면 정확히 30개 샘플을 OpenAI Responses API로 호출한다.
- stdout에는 accuracy, unknown rate, category별 accuracy, latency p50/p95/max, timeout/error count만 남긴다.
- API key, 원본 request body, base64 image, 원본 이미지는 출력하거나 저장하지 않는다.
- AI 입력은 full normalized final image, stroke bounding box 기반 cropped normalized final image, 최대 4개의 deduped stroke sequence frame으로 구성한다.
- 결과 공개 전 `draw-duel:ai-thinking`은 공개용 관찰 코멘트만 전송한다. 비공개 reasoning이나 정답/alias/candidate word bank는 외부 요청 또는 클라이언트 payload에 포함하지 않는다.

해석 기준:

1. timeout/error가 10%를 넘으면 `DRAW_DUEL_AI_REASONING_EFFORT=low`를 유지하고 `DRAW_DUEL_AI_TIMEOUT_MS=15000` 이상에서 추가 리허설한다.
2. 비용 보호를 위해 `DRAW_DUEL_AI_RETRY_LIMIT` 기본값은 `0`으로 둔다. retry가 필요하면 timeout, 네트워크 오류, 5xx에만 적용한다.
3. 오답 중 “과일/동물/탈것”처럼 과도하게 일반적인 답이 20%를 넘으면 prompt의 구체 명사 선호 문구를 유지하거나 강화한다.
4. 두 참가자로 방을 만들고 실제 그림을 그린 뒤, `ai-guessing` 대기 화면에서 관찰 코멘트가 보이고 `draw-duel:ai-thinking` 이후 `draw-duel:ai-guess`, `draw-duel:round-result`가 순서대로 도착하는지 확인한다.
5. 라운드 스킵, 방 리셋, 재접속, 최종 결과가 AI 오류 뒤에도 정상 동작하는지 확인한다.

실제 provider 리허설 기록:

```txt
날짜/장소:
Provider:
Model:
Detail:
평균 AI 응답 시간:
최대 AI 응답 시간:
AI 호출 수:
AI 오류/timeout 수:
Unknown rate:
Category별 정답률:
예상 비용:
정답 단어/aliases/request 노출 여부:
원본 이미지 저장 여부:
스킵/리셋/재접속/최종 결과 이상 여부:
다음 행사 전 수정 필요:
```
