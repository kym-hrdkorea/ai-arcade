# Draw Guess AI / Draw Duel 품질 감사

작성일: 2026-05-21

## MCP 선행 점검

- 요청된 Sequential Thinking MCP는 현재 Codex 도구 검색에서 호출 가능한 도구로 노출되지 않았다.
- 요청된 Playwright MCP 역시 현재 호출 가능한 MCP 도구로 노출되지 않았다.
- 대체 검증은 저장소에 포함된 `@playwright/test` 러너와 브라우저 자동화 스크립트로 수행한다.
- Blocker: 실제 Sequential Thinking MCP / Playwright MCP가 반드시 필요한 운영 증적이라면 해당 MCP 연결을 활성화해야 한다.

## 현재 구조 요약

- 앱은 pnpm 워크스페이스 기반이다.
- 웹은 `apps/web`의 Next.js App Router 구조를 사용한다.
- 실시간 서버는 `apps/realtime-server`의 Socket.IO 서버로 분리되어 있다.
- Draw Duel의 주요 UI는 `apps/web/features/draw-duel/draw-duel-lobby.tsx`와 `draw-duel-board.tsx`에 있다.
- 서버 권위 상태, 점수, 라운드, 재접속 복구는 `apps/realtime-server/src/room-manager.ts`가 담당한다.
- 공유 타입과 Zod 검증은 `packages/shared/src/types/realtime.ts`에 있다.

## Critical

1. `/host`, `/join/[roomCode]`, `/play/[roomCode]`, `/screen/[roomCode]`, `/admin/[roomCode]` 라우트가 없다.
   - 워크숍 운영자가 요구한 리허설 경로와 현재 `/games/draw-duel` 경로가 맞지 않는다.
   - QR 링크도 현재 `/games/draw-duel/join?roomCode=...`라 모바일 입장 UX가 분산된다.

2. 대형 스크린 전용 관전자 모드가 없다.
   - 현재 화면은 플레이어로 입장해야 상태를 받는다.
   - 대형 스크린이 참가자로 집계되면 3명 이상 표시, 점수, 출제자 순서에 영향을 줄 수 있다.

3. 새로고침 복구는 플레이어 세션 중심이며, 스크린/관리 화면의 read-only 복구 payload가 없다.
   - 방 상태, 라운드, 타이머, 결과 슬라이드, 스트로크 히스토리까지 관전자에게 안전하게 재전송하는 경로가 필요하다.

4. 중복 이름 정책이 워크숍 기대와 다를 수 있다.
   - 서버는 현재 중복 닉네임에 숫자를 붙여 자동 허용한다.
   - 요구 조건은 “중복 이름 안내”이므로 자동 변경 사실을 참가자에게 명확히 알려야 한다.

## High

1. 진행자 화면과 대형 스크린 화면의 정보 우선순위가 다르지 않다.
   - 진행자는 QR, 시작, 스킵, 리셋, 설정 변경이 빠르게 보여야 한다.
   - 대형 스크린은 현재 라운드, 참가자, 점수, 정답 공개 상태가 멀리서도 읽혀야 한다.

2. 잘못된 roomCode / 서버 지연 상태의 안내는 기본 메시지가 있으나 화면별 맥락이 부족하다.
   - `/join/[roomCode]`, `/play/[roomCode]`, `/screen/[roomCode]`, `/admin/[roomCode]`에서 각각 명확한 상태 문구가 필요하다.

3. 보안 키 노출 검증 절차가 문서화되어 있지 않다.
   - `OPENAI_API_KEY`와 Supabase Service Role Key가 `NEXT_PUBLIC_*`로 쓰이지 않는지 빌드 전후 확인해야 한다.

## Medium

1. 기존 e2e는 `/games/draw-duel` 중심이라 워크숍 라우트 리허설을 직접 보장하지 않는다.
2. 모바일 QR 입장 후 참가자가 어느 화면에 머무는지 명확한 네이밍이 필요하다.
3. `/admin/[roomCode]`는 보안상 무권한 제어 화면이 되면 안 된다. 기본은 read-only 운영 모니터로 두고, 제어는 호스트 세션이 있는 `/host`에서 처리한다.

## 개선 우선순위

1. 워크숍 라우트 추가 및 QR 링크를 `/join/[roomCode]`로 전환한다.
2. 서버에 read-only `room:watch` 이벤트를 추가해 스크린/관리 화면이 참가자 수에 영향을 주지 않고 상태를 받게 한다.
3. 대형 스크린/관리 화면 컴포넌트를 분리해 멀리서 읽히는 점수판과 상태 칩을 만든다.
4. 참가자 입장 시 중복 이름 자동 변경 안내와 roomCode 오류 안내를 보강한다.
5. Playwright 워크숍 리허설 테스트를 추가하고 `docs/PLAYWRIGHT_REHEARSAL_REPORT.md`에 결과를 기록한다.
6. `npm run lint`, `npm run build`, 키 노출 검색을 수행한다.
