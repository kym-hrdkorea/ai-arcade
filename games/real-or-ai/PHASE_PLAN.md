# Real or AI Phase Plan

이 문서는 `real-or-ai` 개발을 실제 구현 전에 작은 단위로 나누기 위한 계획이다. 각 phase는 기존 AI Arcade 구조와 테스트 습관을 유지하는 것을 기준으로 한다.

## Phase 0. 기획 고정과 이미지 manifest 준비

목표: 163장 이미지의 구조를 서버가 안전하게 섞고 출제할 수 있는 데이터로 정리한다.

범위:

- 실제 이미지 파일은 추가하지 않는다.
- 웹 UI, 서버 로직, 게임 registry는 구현하지 않는다.
- Phase 0 산출물은 문서와 manifest 계약 확정에 한정한다.

작업:

- 163장이 전체 이미지 수인지, 실제/AI 쌍 개수인지 단정하지 않고 두 경우 모두 처리 가능한 정책 확정
- 라운드 item 단위를 `실제 사진 1장 + AI 생성 사진 1장`으로 정의
- 검수 후 짝이 완성된 item 수만 `playableRoundCount`로 인정
- 라운드 수 설정은 이후 구현에서 `1 ~ playableRoundCount` 범위로 제한
- private manifest 필수/선택 필드 확정
- public client payload에서 `sourceType`, `correctCandidateId` 제거 규칙 확정
- 저작권, 초상권, 내부 사용 범위 확인
- 이미지 파일명에 정답 힌트 금지 규칙 확정
- placeholder manifest 예시만 문서에 작성하고 실제 이미지 경로처럼 오해되지 않게 표시

완료 기준:

- `assets/README.md`에 private manifest 계약과 public payload 계약이 명시됨
- 163장이 전체 이미지 수인 경우와 쌍 개수인 경우의 수동 판정 기준이 명시됨
- 이미지 누락, 중복 id, 정답 불일치, AI 후보 정답 지정이 검수 실패로 정의됨
- Phase 1 진입 전에 필요한 TODO가 문서에 남아 있음

## Phase 1. 게임 등록과 허브 노출

목표: 게임이 기존 허브 카드와 도움말 모달 규칙 안에 들어오게 한다.

작업:

- `packages/shared/src/game-registry/real-or-ai.ts` 추가
- `packages/shared/src/game-registry/index.ts` 등록
- `GameModuleMeta.guide.slides` 3~6개 작성
- 썸네일 추가
- `/games/real-or-ai` 라우트 placeholder 추가

완료 기준:

- 허브에 `Real or AI` 카드 표시
- 도움말 `?` 모달에 플레이 흐름 표시
- 기존 게임 카드 UI와 톤이 일치

## Phase 2. 공유 타입과 검증 schema

목표: 설정, 라운드, 제출, 결과 payload를 `packages/shared`에 분리한다.

작업:

- `RealOrAiSettings` 타입과 Zod schema 추가
- 라운드 후보 public/private payload 타입 분리
- answer submit payload 검증
- round result, final result 타입 정의
- 설정 기본값과 허용 범위 테스트

완료 기준:

- `any` 없이 타입 정의
- 서버와 웹이 같은 타입을 import
- 호스트 설정 변경, 게스트 설정 변경 실패, 진행 중 변경 실패 테스트 가능

## Phase 3. Realtime server manager

목표: 기존 게임과 분리된 `RealOrAiRoomManager`를 만든다.

작업:

- `apps/realtime-server/src/real-or-ai-room-manager.ts` 추가
- 방 생성, 참가, 퇴장, 재접속, 리셋 상태 모델 구현
- host-only 설정 변경 검증
- 라운드 item 랜덤 선택과 후보 순서 섞기
- 제출 잠금과 서버 수신 시각 기반 채점
- 100명 방을 고려한 최소 broadcast 설계

완료 기준:

- 다른 게임 manager를 재사용하지 않음
- 라운드당 1회 제출만 허용
- 정답 정보가 라운드 결과 전 public state에 없음
- manager unit test 통과

## Phase 4. Socket.IO handler

목표: `real-or-ai:*` 이벤트를 별도 handler로 연결한다.

작업:

- `apps/realtime-server/src/real-or-ai-socket-handlers.ts` 추가
- create/join/rejoin/leave/settings/start/answer/next/skip/reset 이벤트 연결
- 권한 오류와 payload 오류 메시지 정리
- answer submit 시 개인 ack와 전체 answer count 분리
- timer tick 빈도 검토

완료 기준:

- 모든 게임 전용 이벤트가 `real-or-ai:*` prefix 사용
- 잘못된 payload가 서버 상태를 깨지 않음
- 라운드 결과와 최종 결과 broadcast 정상 동작

## Phase 5. Web lobby와 설정 UX

목표: 기존 로비/운영 패널 패턴에 맞춰 방 생성과 참가 화면을 만든다.

작업:

- `apps/web/app/games/real-or-ai/page.tsx` 추가
- `apps/web/app/games/real-or-ai/join/page.tsx` 추가
- `apps/web/features/real-or-ai/real-or-ai-lobby.tsx` 추가
- 호스트 게임 설정 패널 구현
- 게스트 read-only 설정 요약 구현
- QR 운영 패널은 기본 접힘 상태로 제공
- 모바일 참가 UX 확인

완료 기준:

- 방 생성/참가/재접속 기본 흐름 가능
- 설정 UI가 5/10/15초 빠른 진행과 30/45/60초 꼼꼼히 보기 그룹으로 표시
- 기존 색상과 버튼 스타일을 유지

## Phase 6. Play screen과 라운드 결과

목표: 실제 플레이 루프를 완성한다.

작업:

- 후보 이미지 2장 비교 UI 구현
- 제출 버튼과 제출 완료 상태 구현
- 타이머와 제출 인원 표시
- 라운드 결과 모달 또는 화면 구현
- 라운드 최고 득점자 표시
- 최종 랭킹 화면 구현
- 모바일 세로 배치 최적화

완료 기준:

- 보기 시간 5/10/15/30/45/60초 모두 정상 진행
- 정답/오답/미제출 점수 처리 표시
- 최종 순위가 누적 점수 기준으로 표시
- 텍스트와 이미지가 모바일에서 겹치지 않음

## Phase 7. E2E와 부하 스모크

목표: 행사에서 100명 내외 접속을 고려한 위험을 미리 드러낸다.

작업:

- Playwright 핵심 흐름 추가
- 최소 2명 E2E: 방 생성, 참가, 설정, 시작, 제출, 결과 확인
- manager 단위 테스트에서 100명 참가와 제출 처리 검증
- realtime-server load smoke에 `real-or-ai` 시나리오 추가
- answer broadcast 최소화 검증

완료 기준:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`
- 100명 운영 보장이 아니라 스모크 결과와 한계를 `docs/OPERATIONS.md`에 기록

## Phase 8. 운영 안정화

목표: 행사 진행자가 문제 상황을 처리할 수 있게 한다.

작업:

- 호스트 라운드 스킵
- 방 리셋
- 이미지 누락/로드 실패 fallback
- 참가자 disconnect 표시
- 재접속 복구
- 오류 메시지 한글화
- 운영 전 체크리스트 문서화

완료 기준:

- 이미지 한 장이 실패해도 방 전체가 멈추지 않음
- 호스트가 다음 라운드 또는 리셋으로 복구 가능
- 운영 체크리스트가 문서에 남아 있음

### Phase 8 Final UX - 긴 보기 시간과 실제 확대 돋보기

목표: 최종 테스트용으로 방장/유저 인터페이스를 정리하고, 실제 사진 비교에 맞는 긴 보기 시간과 정확한 확대 UX를 제공한다.

작업:

- 보기 시간 옵션을 기존 5/10/15초에 30/45/60초를 추가하고 기본값을 45초로 변경
- `timer-tick` payload 검증을 60초까지 허용
- 방장 설정 UI를 빠른 진행과 꼼꼼히 보기 그룹으로 정리
- 진행 중 설정 잠금, 현재 라운드, 남은 시간, 제출 인원, 운영 버튼 상태를 명확히 표시
- 후보 이미지는 `object-contain` 중심으로 표시하고 카드 높이를 안정화
- 제출 후 선택 변경과 중복 제출을 UI에서 차단
- inline lens는 렌더링된 이미지 영역과 원본 비율을 계산해 2배 이상 확대
- 확대 모달은 1x/2x/4x, 기본 2x, 드래그 pan, 닫기 동작 제공
- public payload에는 `sourceType`, `correctCandidateId` 같은 정답 메타데이터를 계속 포함하지 않음
- public UI에는 `mock`, `provider`, `asset phase` 같은 개발 용어를 노출하지 않음

완료 기준:

- `pnpm --filter @ai-arcade/shared test`
- `pnpm --filter realtime-server test`
- `pnpm --filter web test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e -- e2e/ux-public-beta.spec.ts -g "Real or AI"`
- `pnpm e2e`

새 창 인수인계:

- 현재 구현은 `apps/web/features/real-or-ai`, `apps/realtime-server/src/real-or-ai-*`, `packages/shared/src/types/real-or-ai.ts`에 분리되어 있다.
- 테스트 서버는 코드 수정 후 재시작해야 한다.
- 기본 재시작은 `pnpm dev`, E2E용 서버는 `pnpm e2e`의 Playwright webServer 설정을 사용한다.
- 빠른 회귀는 5초, 기본 최종 테스트는 45초, 긴 비교 게임은 60초를 사용한다.

## Phase 9. 확장 후보

이번 MVP 범위에는 포함하지 않는다.

- 팀전 모드
- 난이도별 이미지 묶음
- 라운드별 해설 텍스트
- 결과 CSV 다운로드
- DB 저장 랭킹
- 관리자 대시보드
- Redis adapter 기반 다중 서버 확장
