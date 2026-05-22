# Draw Duel 워크숍 Playwright 리허설 보고서

작성일: 2026-05-21

## MCP 가용성

- Playwright MCP는 현재 Codex 도구 검색에서 직접 호출 가능한 도구로 노출되지 않았다.
- 대체로 저장소의 `@playwright/test` 기반 브라우저 러너를 사용했다.
- Sequential Thinking MCP도 현재 호출 가능한 도구로 노출되지 않아 `docs/GAME_QUALITY_AUDIT.md`에 blocker로 기록했다.

## 검증한 핵심 흐름

- `/host`: 진행자 방 생성, QR/참가/스크린/운영 링크 확인, 라운드 시작.
- `/join/[roomCode]`: 모바일 참가자 입장.
- `/play/[roomCode]`: 모바일 플레이 화면 입장.
- `/screen/[roomCode]`: 대형 스크린 대기/진행 상태, 참가자 3명 이상 표시, 점수, 정답 비공개 상태, 새로고침 복구.
- `/admin/[roomCode]`: read-only 운영 모니터와 관련 링크 확인.
- 예외 안내: 잘못된 roomCode, 중복 이름 자동 변경, 네트워크 지연 안내.
- 라운드 결과: 참가자 3명 정답 제출 후 정답 공개와 최신 점수 `100` 표시 확인.

## 실행 결과

1. `pnpm e2e e2e/draw-duel-workshop.spec.ts`
   - 1차: 실패
   - 원인: 대형 스크린 대기 화면에서 QR은 보였지만 참가자 목록 패널이 게임 시작 전에는 렌더되지 않았다.
   - 조치: 대기 화면에도 `draw-duel-screen-participants` 참가자 패널을 고정 표시하도록 수정.

2. `pnpm e2e e2e/draw-duel-workshop.spec.ts`
   - 결과: 통과
   - 1 passed
   - CTO 리뷰 중 발견한 점수 우선순위 문제 수정 후 재실행 통과.

3. `pnpm e2e e2e/draw-duel.spec.ts`
   - 결과: 통과
   - 7 passed

4. `npm run lint`
   - 결과: 통과
   - 1차 lint에서 미사용 import와 불필요한 eslint-disable 경고가 있었고 수정 후 재실행 통과.

5. `npm run build`
   - 결과: 통과
   - Next.js 빌드에서 `/host`, `/join/[roomCode]`, `/play/[roomCode]`, `/screen/[roomCode]`, `/admin/[roomCode]` 라우트 생성 확인.

6. 키 노출 검색
   - `rg "OPENAI_API_KEY|SUPABASE_SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY" apps\web apps\realtime-server packages -n`
   - `rg "NEXT_PUBLIC_(OPENAI|SUPABASE|.*KEY|.*SECRET)" apps packages .env.example -n`
   - `rg "sk-[A-Za-z0-9_-]{20,}|sb_secret|service_role" -n --hidden -g '!node_modules' -g '!test-results' -g '!*.png' -g '!*.webp' -g '!pnpm-lock.yaml'`
   - 결과: 클라이언트 코드에서 Supabase Service Role Key 또는 OpenAI API Key 노출 없음. `OPENAI_API_KEY` 참조는 realtime-server 서버 코드와 테스트 fixture에만 존재.

7. `pnpm e2e e2e/draw-duel-player-ux-audit.spec.ts`
   - 결과: 통과
   - 1 passed
   - 모바일 390x844 기준 대기/정답자/출제자 화면과 대형 스크린 대기/진행/결과 화면을 캡처했다.
   - 개선 후 모바일 대기 화면은 `scrollHeight 844 / viewport 844`이며 캔버스를 렌더하지 않는다.
   - 정답자 화면은 캔버스와 답변 form이 첫 화면 안에 들어오고, 출제자 화면은 제시어 chip과 캔버스가 첫 화면 안에 들어온다.
   - 대형 스크린은 기본 설정에서 라운드 시작 후 헤더 room code를 숨긴다.
   - 나가기, 전체 지우기, 방 리셋 확인 모달을 검증했다.
   - 증적: `tmp/player-ux-audit/`
   - 상세 요구사항: `docs/PLAYER_UX_REQUIREMENTS.md`

8. `pnpm benchmark:load-smoke:all`
   - 결과: 통과
   - Draw Duel: 100 clients / 10 rooms, connection success 100.0%, answer submissions 30, event errors 0, elapsed 428ms
   - Real or AI: 100 clients / 1 room, connection success 100.0%, answer submissions 100, event errors 0, elapsed 4013ms
   - Target: `http://127.0.0.1:4000`
   - 해석: 로컬 공개 베타 게이트 기준 통과이며, 실제 행사장 100명 운영 보장은 별도 배포/네트워크 리허설로 판단한다.

## 비고

- Playwright 실행 중 Next dev server의 Watchpack이 `C:\DumpStack.log.tmp`, `C:\hiberfil.sys`, `C:\pagefile.sys`, `C:\swapfile.sys`를 initial scan 하며 `EINVAL` 경고를 출력했다.
- 해당 경고는 테스트 실패로 이어지지 않았고 모든 대상 Playwright 테스트는 통과했다.
