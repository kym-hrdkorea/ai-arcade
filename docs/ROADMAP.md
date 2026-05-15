# ROADMAP.md — AI Arcade 개발 로드맵

## Phase 0. 준비

목표: Codex가 작업할 수 있는 저장소 기반 마련

작업:

- Git 저장소 생성
- Node.js, pnpm 설치
- Next.js 프로젝트 생성
- TypeScript, Tailwind 설정
- AGENTS.md, DESIGN.md, GAME_SPEC.md 배치
- `.env.example` 작성
- 기본 README 작성

완료 기준:

- `pnpm dev` 실행 가능
- 첫 화면 표시
- Codex가 프로젝트 구조를 설명 가능

## Phase 1. 게임 허브 MVP

목표: 여러 게임을 선택할 수 있는 메인 화면 구성

작업:

- 레트로 디자인 시스템 구현
- 게임 카드 컴포넌트
- 게임 레지스트리
- `draw-duel` 카드 표시
- 반응형 레이아웃
- 기본 도움말 모달

완료 기준:

- 메인 페이지에서 게임 카드 표시
- 카드 클릭 시 게임 로비 이동
- 모바일에서도 레이아웃 유지

## Phase 2. Draw Duel 로비

목표: 방 생성과 참가 구현

작업:

- 방 코드 생성
- 닉네임 입력
- 참가자 목록
- 호스트 권한
- 게임 시작 버튼
- realtime server 기본 연결

완료 기준:

- 서로 다른 브라우저에서 같은 방 입장 가능
- 참가자 목록 실시간 반영
- 호스트만 시작 가능

## Phase 3. 실시간 드로잉

목표: 출제자가 그린 그림을 참가자에게 실시간 공유

작업:

- Canvas 컴포넌트
- pointer event 처리
- stroke 데이터 구조
- socket 이벤트 전송
- stroke history 복원
- 전체 지우기

완료 기준:

- 한 브라우저에서 그린 선이 다른 브라우저에 표시
- 모바일 터치 드로잉 가능
- 과도한 이벤트 전송 방지

## Phase 4. 라운드·정답·점수

목표: 실제 게임으로 플레이 가능한 수준 구현

작업:

- 라운드 생성
- 출제자 순환
- 제시어 표시
- 타이머
- 정답 입력
- 정답 판정
- 점수 계산
- 라운드 결과 표시

완료 기준:

- 최소 3명이 한 게임을 끝까지 진행 가능
- 점수판 정상 갱신
- 게임 종료 화면 표시

## Phase 5. AI 추측 연동 구조

목표: AI 기능을 안전하게 확장 가능한 구조로 분리

작업:

- [x] `AIGuesser` 인터페이스
- [x] `MockAIGuesser`
- [x] 라운드당 AI 추측 표시
- [x] 추후 Vision API 교체 지점
- [x] AI 호출 횟수 제한 설계

완료 기준:

- [x] Mock AI가 라운드마다 추측
- [x] 실제 API 없이도 게임 흐름 완성
- [x] 실제 API로 교체 가능한 구조

메모:

- 실제 Vision API, 이미지 캡처 전송, API 키 관리는 Phase 5 범위에서 제외했다.
- AI 점수와 최종 순위는 서버 `scores`/`results` entry의 `source: "ai"`로 표현한다.

## Phase 6. 운영 안정화

목표: 행사 현장에서 쓸 수 있는 수준으로 안정화

작업:

- [x] QR 입장
- [x] 호스트 전용 라운드 스킵
- [x] 호스트 전용 방 리셋
- [x] 오류 UX 개선
- [x] 같은 브라우저/sessionStorage 재접속 복구
- [x] 100명 가정 부하 스모크 스크립트
- [x] 운영 문서 갱신

완료 기준:

- [x] 행사 전 리허설 가능
- [x] 문제 발생 시 호스트가 라운드 스킵 또는 방 리셋 가능
- [x] 100명은 보장이 아니라 스모크 기준으로 문서화
- [ ] 30~50명 파일럿 테스트는 실제 행사 네트워크에서 별도 수행

제외:

- 실제 Vision API
- OAuth/관리자 계정
- DB 저장 복구
- Redis adapter
- 운영자 대시보드

## Phase 6.5. 파일럿 안정화 및 E2E 검증

목표: 실제 AI 그림 추측 연동 전에 Draw Duel을 반복 검증 가능한 행사 파일럿 상태로 고정

작업:

- [x] Playwright E2E 구성
- [x] 호스트/게스트 핵심 흐름 자동 검증
- [x] QR 접힘/확대 모달 검증
- [x] 게임 설정, host-only, rotate 검증
- [x] 라운드 스킵, 방 리셋, 재접속, 최종 결과 회귀 검증
- [ ] 내부 20명 테스트 기록
- [ ] 실제 행사 네트워크 30~50명 파일럿 기록

완료 기준:

- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` 통과
- [ ] 20명 내부 테스트에서 방 생성/참가/드로잉/정답/운영 기능 이상 없음
- [ ] 30~50명 행사 네트워크 파일럿에서 WebSocket 차단, 지연, QR 입장 문제 기록

Phase 7 진입 조건:

- `pnpm e2e`를 기본 회귀 검증으로 유지
- 20명 내부 테스트 완료
- 30~50명 파일럿 테스트 결과를 `docs/OPERATIONS.md`에 기록

## Phase 7. Draw Duel 실제 AI 그림 추측

목표: 현재 `MockAIGuesser`를 서버 제어형 이미지 기반 AI 추측으로 교체할 수 있게 만들고, 행사 환경에서 비용·보안·지연을 통제한다.

작업:

- [ ] AI provider 선택 기준과 서버 환경변수 계약 정의
- [ ] `AIGuesser` 입력을 provider-safe 구조로 분리해 외부 AI가 정답 단어를 직접 받지 않도록 변경
- [ ] 라운드 중 AI 추측 시점에만 캔버스 snapshot을 생성하는 파이프라인 추가
- [ ] stroke history에서 서버가 재구성한 이미지 또는 검증된 클라이언트 snapshot만 AI 입력으로 사용
- [ ] `VisionAIGuesser` 추가
- [ ] Mock provider를 기본값과 테스트 fallback으로 유지
- [ ] AI 호출 timeout, retry, circuit breaker, 라운드당 1회 호출 제한 구현
- [ ] 이미지 크기, mime type, base64 길이, room/round 권한 검증 추가
- [ ] AI 오류 시 게임 흐름이 멈추지 않도록 짧은 실패 메시지와 no-score 처리 적용
- [ ] AI 추측 결과, confidence, provider, latency를 서버 로그에 기록하되 원본 이미지는 승인 없이 저장하지 않음
- [ ] `.env.example`, `docs/OPERATIONS.md`, `games/draw-duel/GAME_SPEC.md`에 실제 AI 운영 절차 문서화
- [ ] 단위 테스트, fake vision adapter 테스트, E2E 회귀 테스트 추가

완료 기준:

- [ ] 실제 AI provider를 켜도 API 키가 클라이언트 번들에 노출되지 않음
- [ ] 외부 AI prompt 또는 request payload에 정답 단어가 직접 포함되지 않음
- [ ] AI 추측이 실제 그림 snapshot을 기반으로 1라운드 1회 수행됨
- [ ] provider 장애·timeout 시 라운드, 점수판, 최종 결과, 스킵, 리셋, 재접속이 유지됨
- [ ] Mock provider 기준 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` 통과
- [ ] 실제 provider 수동 리허설에서 지연, 비용, 오류 로그가 `docs/OPERATIONS.md`에 기록됨

제외:

- DB 저장
- Redis adapter
- OAuth/관리자 계정
- 운영자 대시보드
- 새 게임 추가

## Phase 8. 게임 확장 아이디어 정리

목표: 사용자가 제공하는 새 게임 아이디어를 바탕으로 다음 게임 후보와 구현 순서를 확정한다.

메모:

- Phase 8 전에는 특정 새 게임 후보를 로드맵에 고정하지 않는다.
- 새 게임은 `docs/GAME_MODULE_SPEC.md`의 설정, 운영 패널, QR, 재접속, 권한 정책을 따른다.
- Draw Duel 회귀 테스트와 실제 AI 그림 추측 안정성이 유지되는 범위에서만 확장한다.
