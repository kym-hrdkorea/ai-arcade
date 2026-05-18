# AGENTS.md — AI Arcade 개발 지침

## 0. 프로젝트 정체성

AI Arcade는 여러 명이 동시에 접속해 즐기는 웹 기반 AI 레크리에이션 게임 플랫폼이다.

핵심 방향은 다음과 같다.

- 하나의 웹사이트 안에서 여러 게임을 선택해 실행하는 **모듈형 게임 허브**
- 첫 번째 게임은 **인간 vs AI 그림 맞추기 대결**
- 디자인은 **레트로 게임기·오락실·픽셀 UI** 감성
- 100명 내외 동시 접속을 현실적으로 감당할 수 있는 구조
- 게임별 기능을 독립적으로 추가·수정할 수 있는 구조
- 기획자가 Codex에 단계별로 지시해도 무너지지 않는 명확한 폴더·규칙·검증 체계

## 1. Codex 작업 원칙

Codex는 매 작업 전에 아래 순서를 따른다.

1. 현재 저장소 구조를 먼저 파악한다.
2. 이미 존재하는 기술 스택과 파일 구조를 우선 존중한다.
3. 없는 경우에는 본 문서의 기본 스택을 따른다.
4. 큰 변경은 작은 단위로 나눈다.
5. UI, 게임 로직, 실시간 통신, API, 데이터 모델을 한 파일에 몰아넣지 않는다.
6. 작업 완료 후 실행·린트·테스트 가능 여부를 확인한다.
7. 불확실한 부분은 임의로 숨기지 말고 `TODO:` 주석 또는 작업 보고에 남긴다.

## 2. 기본 기술 스택

기존 저장소가 비어 있거나 명확한 스택이 없으면 아래를 기본값으로 사용한다.

- Frontend: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- UI State: Zustand 또는 React Context
- Realtime: Socket.IO 또는 WebSocket 기반 Node 서버
- DB: PostgreSQL + Prisma
- Auth: 초기 MVP에서는 닉네임 기반 게스트 입장, 추후 OAuth 확장
- Deploy: Vercel 또는 Render/Fly.io/Railway 조합
- Testing: Vitest, React Testing Library, Playwright
- Package Manager: pnpm 우선

단, 실시간 드로잉 게임은 Next.js 단독 서버리스 구조보다 별도 realtime server 구성이 안정적이다. 저장소 구조는 이를 고려해 설계한다.

## 3. 권장 저장소 구조

```txt
ai-arcade/
  AGENTS.md
  README.md
  package.json
  .env.example

  apps/
    web/
      app/
      components/
      features/
      lib/
      styles/
      public/
    realtime-server/
      src/
      tests/

  packages/
    shared/
      src/
        types/
        game-registry/
        validation/
    game-sdk/
      src/

  games/
    draw-duel/
      GAME_SPEC.md
      components/
      engine/
      server/
      tests/

  docs/
    DESIGN.md
    ARCHITECTURE.md
    GAME_MODULE_SPEC.md
    ROADMAP.md
    OPERATIONS.md

  prompts/
    CODEX_START_PROMPT.md
    ADD_GAME_PROMPT.md
    REVIEW_PROMPT.md
```

저장소가 단일 앱으로 시작하더라도, 게임 모듈과 실시간 서버는 분리 가능한 경계를 유지한다.

## 4. 게임 모듈 공통 규칙

모든 게임은 다음 인터페이스를 갖는다.

```ts
export type GameModule = {
  id: string;
  title: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  thumbnail: string;
  route: string;
  status: "draft" | "beta" | "stable";
  tags: string[];
};
```

게임 추가 시 반드시 아래 항목을 만든다.

- `games/{game-id}/GAME_SPEC.md`
- 클라이언트 컴포넌트
- 서버 이벤트 명세
- 라우팅 등록
- 게임 카드 등록
- 최소 테스트
- README 또는 운영 설명 업데이트

게임 하나를 추가할 때 기존 게임이 깨지면 안 된다.

## 4-1. 게임 공통 운영·설정 UX 규칙

모든 실시간 게임은 시작 전 설정과 운영 절차를 공통 패턴으로 제공한다.

- 게임별 설정 schema, 기본값, 허용 범위는 `packages/shared`에 타입과 검증 schema로 둔다.
- 설정 변경은 호스트만 가능하며, 기본적으로 `waiting` 상태에서만 허용한다.
- 서버는 설정, 권한, 라운드 상태 전환, 점수 계산의 authoritative source가 된다.
- 게스트 화면에는 현재 설정 요약만 read-only로 표시한다.
- 호스트 화면에는 시작 전 “게임 설정” 패널과 운영 중 “운영 패널”을 분리해 제공한다.
- QR 입장은 호스트 운영 패널 안에서만 제공하고, 기본 접힘 상태로 둔다.
- QR 확대 UI는 프로젝트 디자인 톤을 따르는 모달로 제공하며, 방 코드와 닫기 동작을 포함한다.
- QR 생성은 저장소 내부 로컬 구현을 우선 사용하고, 외부 QR API는 승인 없이 추가하지 않는다.
- 방 리셋은 방 코드와 설정을 유지하고 게임 진행 상태, 점수, 라운드, 캔버스, 타이머, 예약 작업만 초기화한다.
- 재접속 복구 payload에는 현재 설정과 public 상태를 포함하되, 정답 같은 비공개 정보는 출제자에게만 전송한다.
- 권한 오류는 짧고 자연스러운 한글 메시지로 반환한다.

## 5. 첫 번째 게임: 인간 vs AI 그림 맞추기 대결

게임 ID는 `draw-duel`로 한다.

핵심 흐름은 다음과 같다.

1. 방 만들기 또는 방 참가
2. 닉네임 입력
3. 역할 배정
   - 인간 출제자
   - 인간 정답자
   - AI 정답자 또는 AI 출제자
4. 제시어 생성
5. 인간이 제한 시간 안에 마우스 또는 터치로 그림 작성
6. 인간 참가자와 AI가 동시에 정답 추측
7. 점수 계산
8. 라운드 반복
9. 최종 결과 화면 표시

초기 MVP에서는 다음 범위를 우선 구현한다.

- 방 생성
- 닉네임 기반 참가
- 실시간 캔버스 스트로크 공유
- 라운드 타이머
- 제시어 표시
- 채팅형 정답 입력
- 정답 판정
- 점수판
- 게임 종료 화면

AI 추측 기능은 초기에는 모의 응답으로 구현하고, 이후 이미지 인식 API 또는 멀티모달 모델 연동 지점만 명확히 둔다.

## 5-1. Draw Duel 실제 AI 그림 추측 전환 규칙

Draw Duel의 다음 핵심 Phase는 새 게임 추가보다 실제 그림 기반 AI 추측 전환을 우선한다.

- `MockAIGuesser`는 기본값과 테스트 fallback으로 유지한다.
- 실제 AI provider 호출은 `apps/realtime-server` 내부에서만 수행하고, API 키는 서버 환경변수에만 둔다.
- 클라이언트는 AI API를 직접 호출하지 않으며, `draw-duel:ai-guess` 같은 서버 이벤트 결과만 수신한다.
- 외부 AI provider에는 정답 단어 또는 aliases를 직접 전달하지 않는다. 정답 판정과 점수 계산은 서버 내부에서만 수행한다.
- AI 입력 이미지는 라운드 중 AI 추측 시점에만 생성한다. 매 stroke마다 전체 이미지나 base64 snapshot을 전송하지 않는다.
- snapshot은 가능한 한 서버가 stroke history로 재구성하고, 클라이언트 snapshot을 받는 경우 room, round, drawer, 크기, mime type을 서버에서 검증한다.
- AI 호출은 라운드당 1회로 제한하고 timeout, retry 제한, fallback, 오류 메시지를 명시한다.
- provider 장애가 발생해도 라운드 진행, 점수판, 최종 결과, 스킵, 리셋, 재접속이 깨지면 안 된다.
- 원본 이미지 저장, prompt/response 장기 보관, 외부 분석 서비스 전송은 별도 승인 없이 추가하지 않는다.
- 실제 AI 연동 Phase 완료 전에는 Mock provider 기준 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`가 통과해야 한다.

## 5-2. Three Word Monster 추가 규칙

두 번째 게임은 `three-word-monster`로 추가한다.

- route는 `/games/three-word-monster`로 둔다.
- Socket.IO 이벤트는 `three-word-monster:*` prefix만 사용한다.
- Draw Duel의 `draw-duel:*` 이벤트, `RoomManager`, AI guesser, stroke renderer를 재사용하지 않는다.
- 새 게임 서버 로직은 `three-word-monster-room-manager.ts` 같은 별도 manager와 handler로 분리한다.
- 최대 참가자/팀은 10명이며, 개인 참가를 기본으로 하되 닉네임을 팀명처럼 사용할 수 있게 설계한다.
- 상태는 `waiting`, `word-submission`, `image-generating`, `voting`, `revealing`, `result`를 사용한다.
- 목표는 3개 단어 제출, 괴물 이미지 생성, 자기 것 제외 투표, 최다 득표 WINNER 발표다.
- 기본 이미지 provider는 mock으로 두고, 실제 OpenAI 이미지 생성은 realtime-server의 서버 환경변수로만 켠다.
- OpenAI API 키는 클라이언트에 절대 노출하지 않는다.
- 모든 참가자의 이미지 사이즈, 스타일, 프롬프트 구조는 서버에서 동일하게 고정한다.
- 생성 이미지는 v1에서 room memory에만 저장하고 장기 보관하지 않는다.
- 선정적/노골적/저작권 캐릭터/로고/텍스트가 나오지 않도록 안전한 이미지 프롬프트를 서버에서 고정 적용한다.
- 실제 provider 장애가 발생해도 mock fallback으로 라운드 진행, 투표, 결과 발표, 리셋이 깨지지 않아야 한다.

## 6. 실시간 통신 이벤트 규칙

이벤트 이름은 `domain:action` 형식으로 작성한다.

예시:

```ts
"room:create"
"room:join"
"room:leave"
"game:start"
"round:start"
"draw:stroke"
"draw:clear"
"guess:submit"
"score:update"
"timer:tick"
"game:end"
"error"
```

모든 이벤트 payload는 `packages/shared`의 타입을 사용한다.

서버는 클라이언트 입력을 신뢰하지 않는다. 정답 판정, 점수 계산, 라운드 상태 변경은 서버 기준으로 처리한다.

## 7. UI·UX 원칙

상세 디자인은 `docs/DESIGN.md`를 따른다.

공통 원칙은 다음과 같다.

- 첫 화면은 레트로 게임기 메인 메뉴처럼 보이게 한다.
- 게임 카드는 오락실 게임 선택 화면처럼 구성한다.
- 버튼은 픽셀 버튼 또는 게임기 조작 버튼 느낌을 준다.
- 과도한 네온, 과한 애니메이션, 가독성 낮은 픽셀 폰트 남용은 금지한다.
- 모바일에서도 방 참가와 정답 입력이 가능해야 한다.
- 드로잉은 데스크톱 마우스와 모바일 터치를 모두 지원한다.

## 8. 코드 품질 규칙

- TypeScript에서 `any` 사용 금지. 불가피한 경우 주석으로 사유 작성
- 컴포넌트는 200줄 내외 권장. 초과 시 분리 검토
- 비즈니스 로직은 UI 컴포넌트에서 분리
- 서버 이벤트 payload는 Zod 등으로 검증
- 환경변수는 `.env.example`에 문서화
- API 키, 토큰, 비밀번호는 절대 커밋 금지
- 오류는 사용자에게 친화적인 메시지로 표시하되, 개발 로그에는 원인 추적 가능하게 남김
- 한글 UI 문구는 자연스럽고 짧게 작성

## 9. 테스트·검증 명령

저장소에 명령이 존재하면 아래 순서로 실행한다.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

실시간 서버가 있는 경우 다음도 확인한다.

```bash
pnpm --filter realtime-server test
pnpm --filter realtime-server dev
```

E2E 테스트가 있는 경우 최소 1개 핵심 흐름을 실행한다.

```bash
pnpm e2e
```

## 10. 완료 기준

작업 완료 보고에는 반드시 아래를 포함한다.

- 변경한 파일 목록
- 구현한 기능
- 실행한 검증 명령과 결과
- 남은 TODO
- 다음에 하면 좋은 작업

## 11. 금지 사항

- 게임별 코드를 전역 파일에 무분별하게 추가 금지
- `app/page.tsx`에 모든 화면을 몰아넣기 금지
- 방 상태를 클라이언트에서만 관리 금지
- AI API 키를 클라이언트에 노출 금지
- 디자인 일관성 없이 게임마다 전혀 다른 UI 적용 금지
- 실제 과금 API 또는 외부 서비스 연동을 승인 없이 추가 금지
- 100명 동시 접속을 보장한다고 단정 금지. 항상 부하 테스트 필요성을 표시

## 12. 커밋 단위 권장

권장 작업 단위는 다음과 같다.

1. 프로젝트 스캐폴딩
2. 디자인 시스템 구축
3. 게임 허브 화면
4. 방 생성·참가 기능
5. 실시간 캔버스
6. 라운드·타이머
7. 정답·점수 시스템
8. AI 연동 인터페이스
9. 운영·배포 문서
10. 부하 테스트와 안정화
