# AI Arcade

AI Arcade는 여러 명이 동시에 접속해 즐기는 웹 기반 AI 레크리에이션 게임 플랫폼입니다.

첫 번째 게임은 `draw-duel`입니다. 한 명이 제시어를 보고 그림을 그리면, 인간 참가자와 AI가 동시에 정답을 맞히는 실시간 대결 게임으로 확장합니다.

## 현재 상태

Phase 7 공개 베타 플레이어 벤치마크 안정화 단계입니다.

- `apps/web`: Next.js App Router 기반 레트로 게임 허브
- `apps/realtime-server`: Socket.IO 기반 방 생성·참가 서버
- `packages/shared`: 공통 타입, 게임 레지스트리, 실시간 이벤트 payload 검증
- `games/draw-duel`: 게임 명세와 구현 경계
- 허브 화면: `draw-duel` 카드, 방 코드 빠른 참가, 도움말 모달
- Draw Duel 로비: 방 생성, 방 코드 참가, 참가자 목록, 호스트 권한 표시
- Draw Duel 캔버스: 호스트 드로잉, 게스트 관전, stroke history 복원, 전체 지우기 동기화
- Draw Duel 게임 진행: 라운드, 출제자 순환, 제시어, 타이머, 정답 판정, 점수판, 라운드/최종 결과
- Draw Duel Mock AI: 서버 내부 `AIGuesser` 경계, 라운드당 1회 Mock AI 추측, AI 점수판/최종 결과 표시
- Draw Duel 운영 안정화: QR 입장, 호스트 전용 라운드 스킵/방 리셋, 같은 브라우저 재접속 복구, 끊김 상태 표시
- Draw Duel 파일럿 준비: 호스트 전용 QR 운영 패널, 시작 전 게임 설정, Playwright E2E 시나리오
- 부하 스모크: Draw Duel 100 clients/10 rooms, Real or AI 100 clients/1 room Socket.IO 시나리오 스크립트

## 실행 방법

```bash
pnpm install
pnpm dev
```

개별 실행:

```bash
pnpm --filter web dev
pnpm --filter realtime-server dev
```

기본 주소:

- Web: `http://localhost:3000`
- Realtime health check: `http://localhost:4000/health`

## 친구에게 테스트 링크 공유하기

빠른 외부 테스트는 `ngrok`으로 로컬 web과 realtime-server를 각각 공개합니다.

```bash
ngrok http 3000
ngrok http 4000
```

두 ngrok URL을 받은 뒤 로컬 서버를 다시 시작합니다.

- Web 실행 환경: `NEXT_PUBLIC_REALTIME_URL=https://<realtime-ngrok-url>`
- Realtime 실행 환경: `CORS_ORIGIN=https://<web-ngrok-url>`

계속 공유할 안정 URL이 필요하면 `apps/web`은 Vercel에, `apps/realtime-server`는 Render/Fly/Railway 같은 Node 장기 실행 서버에 따로 배포합니다. 자세한 순서는 `docs/OPERATIONS.md`의 “외부 플레이 가능 환경” 섹션을 따릅니다.

## 검증 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm e2e:serial
```

공개 베타 플레이어 벤치마크 기준과 점수표는 `docs/PUBLIC_BETA_BENCHMARK.md`를 따른다.
전체 공개 베타 게이트는 아래 명령으로 실행한다.

```bash
pnpm benchmark:public-beta
```

부하 스모크는 realtime-server가 실행 중일 때 별도로 실행합니다. 전체 공개 베타 스모크는 Draw Duel과 Real or AI를 연속으로 확인합니다.

```bash
pnpm benchmark:load-smoke
pnpm benchmark:load-smoke:all
pnpm benchmark:load-smoke:draw-duel
pnpm benchmark:load-smoke:real-or-ai
```

이 결과는 100명 운영 보장이 아니라 로컬/행사 환경 점검용 스모크 결과로만 기록합니다.

## 개발 원칙

- 게임별 기능은 `games/{game-id}` 경계를 유지합니다.
- 공통 타입과 이벤트 payload는 `packages/shared`에서 관리합니다.
- 실시간 방 상태, 정답 판정, 점수 계산은 클라이언트가 아니라 서버 기준으로 처리합니다.
- Mock AI는 `apps/realtime-server` 내부에서만 실행하며, AI API 키는 클라이언트에 노출하지 않습니다.
- 운영 기능은 별도 로그인 없이 방 호스트 권한으로만 처리합니다.
- 재접속 복구는 같은 브라우저 `sessionStorage` 기반이며 DB 저장 복구는 하지 않습니다.

## 다음 단계

1. 실제 행사 네트워크 30~50명 리허설 기록
2. 배포 환경에서 `pnpm benchmark:load-smoke:all`에 준하는 Socket.IO 스모크 재확인
3. Draw Duel의 Mock AI를 실제 이미지 기반 AI 추측으로 전환하는 별도 리허설
4. 새 게임 후보는 사용자 아이디어 확정 후 별도 Phase로 정리
5. Redis adapter, DB 저장, 관리자 대시보드는 별도 Phase에서 검토
