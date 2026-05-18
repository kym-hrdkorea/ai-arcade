# GAME_MODULE_SPEC.md — 게임 모듈 규격

## 1. 목적

AI Arcade는 게임을 하나씩 추가해 성장하는 플랫폼이다.  
새로운 게임은 기존 구조를 깨지 않고, 동일한 등록 방식으로 허브에 추가되어야 한다.

## 2. 게임 모듈 필수 정보

```ts
export type GameModuleMeta = {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  thumbnail: string;
  route: string;
  status: "draft" | "beta" | "stable";
  tags: string[];
  requiredCapabilities: GameCapability[];
  guide: {
    slides: {
      title: string;
      body: string;
      items: string[];
    }[];
  };
};

export type GameCapability =
  | "realtime"
  | "drawing"
  | "chat"
  | "voice"
  | "image-ai"
  | "text-ai"
  | "team-play"
  | "host-mode";
```

## 3. 게임 폴더 구조

```txt
games/{game-id}/
  GAME_SPEC.md
  components/
    {GameName}Room.tsx
    {GameName}Lobby.tsx
    {GameName}Result.tsx
  engine/
    rules.ts
    scoring.ts
    state.ts
  server/
    events.ts
    handlers.ts
  tests/
    rules.test.ts
    scoring.test.ts
```

## 4. 게임 등록 절차

새 게임을 추가할 때 Codex는 다음 순서를 따른다.

1. `games/{game-id}/GAME_SPEC.md` 작성
2. `packages/shared/src/game-registry`에 메타데이터 추가
3. 게임별 `guide.slides`에 첫 화면 카드에서 열릴 규칙/사용설명 작성
4. `apps/web`의 게임 허브에 카드와 `?` 사용설명 자동 표시 확인
5. 게임 라우트 생성
6. 게임 전용 컴포넌트 작성
7. 실시간 이벤트가 필요하면 realtime-server handler 추가
8. 최소 테스트 작성
9. README 또는 docs 업데이트

## 4-1. 게임 카드 사용설명

허브의 게임 카드에는 공통 `?` 사용설명 버튼이 자동으로 붙는다.  
새 게임은 `GameModuleMeta.guide.slides`만 작성하면 별도 카드 컴포넌트 수정 없이 모달 슬라이드에 표시된다.

작성 규칙:

- 슬라이드는 실제 플레이 전 알아야 할 흐름과 핵심 규칙 중심으로 3~6개 작성한다.
- 각 슬라이드는 짧은 `title`, 한 문단 `body`, 버튼으로 넘겨 읽기 쉬운 `items` 2~4개를 가진다.
- 상세 운영 정책, 서버 이벤트, 내부 구현 설명은 `GAME_SPEC.md`에 두고 카드 설명에는 노출하지 않는다.
- 한글 문구는 짧고 자연스럽게 작성한다.

## 5. 공통 게임 상태

```ts
export type BaseGameState = {
  gameId: string;
  roomId: string;
  status: "waiting" | "countdown" | "playing" | "scoring" | "ended";
  players: Player[];
  hostPlayerId: string;
};
```

게임별 상태는 이를 확장한다.

```ts
export type DrawDuelState = BaseGameState & {
  currentRound: number;
  maxRounds: number;
  drawerPlayerId: string;
  currentWord?: string;
  canvasSnapshot?: string;
};
```

## 6. 공통 이벤트

모든 실시간 게임은 가능하면 아래 이벤트를 재사용한다.

```txt
room:create
room:join
room:leave
room:state
game:ready
game:start
game:end
player:update
error
```

게임별 이벤트는 `{gameId}:{action}` 또는 `{domain}:{action}` 형식 사용을 권장한다.

## 7. 공통 게임 설정 및 운영 절차

새 실시간 게임은 시작 전 설정과 운영 UX를 반드시 명세한다.

필수 항목:

- 설정 schema와 기본값
- 설정 허용 범위와 UI 컨트롤 방식
- 호스트만 수정 가능한 설정 목록
- 게스트 read-only 설정 요약
- 게임 시작 후 변경 가능 여부
- 방 리셋 시 유지할 설정과 초기화할 상태
- 재접속 snapshot에 포함할 public 설정과 비공개 제외 항목
- QR 입장 제공 여부와 호스트 전용 노출 정책
- 운영 패널의 스킵, 리셋, 다음 진행 등 권한 정책
- 권한 실패, 진행 중 변경 실패, 잘못된 payload의 짧은 한글 오류 메시지

기본 원칙:

- `packages/shared`에 설정 타입과 검증 schema를 둔다.
- 서버가 설정 변경, 상태 전환, 점수 계산, 권한 판정을 authoritative하게 처리한다.
- 클라이언트는 설정 입력과 표시만 담당하고, 서버 응답의 `room:state`를 확정 상태로 사용한다.
- QR은 외부 API 대신 저장소 내부 로컬 QR 생성 방식을 우선한다.
- 새 게임의 최소 테스트는 호스트 설정 변경, 게스트 수정 실패, 진행 중 변경 실패, reset/rejoin 동작을 포함한다.

## 8. 점수 시스템 원칙

- 점수 계산은 서버에서 수행
- 클라이언트는 점수 표시만 담당
- 라운드별 점수와 누적 점수를 구분
- 동점 상황 처리 규칙을 명시
- AI와 인간의 점수 기준을 동일하게 할지 별도 기준으로 할지 GAME_SPEC에 명시

## 9. AI 연동 게임 원칙

`image-ai` 또는 `text-ai` capability를 쓰는 게임은 AI provider를 서버 경계 안에 둔다.

- AI API 키, provider secret, 비용 관련 설정은 서버 환경변수에만 둔다.
- 외부 AI request에는 정답, 채점 기준, 비공개 참가자 정보처럼 결과를 누출할 수 있는 값을 직접 넣지 않는다.
- provider 입력과 서버 내부 scoring context를 타입으로 분리한다.
- 호출 횟수, timeout, retry, fallback, 장애 시 사용자 메시지를 GAME_SPEC에 명시한다.
- Mock 또는 fake provider를 기본 테스트 경로로 유지한다.
- 원본 이미지, 음성, prompt, response를 저장할 때는 운영 문서에 보관 범위와 기간을 먼저 명시한다.

## 10. 운영자 모드

행사 운영을 위해 추후 모든 게임은 운영자 모드를 지원할 수 있어야 한다.

운영자 기능 후보:

- 방 목록 보기
- 강제 시작
- 라운드 스킵
- 문제 재생성
- 사용자 강퇴
- 전체 리셋
- 결과 다운로드

초기 MVP에서는 코드 구조만 확장 가능하게 둔다.

## 11. 게임 추가 시 검토 체크리스트

```txt
[ ] 게임 ID가 고유한가
[ ] 게임 카드가 허브에 표시되는가
[ ] 게임 카드 `?` 사용설명에 규칙과 플레이 순서가 표시되는가
[ ] 방 생성과 참가가 정상 동작하는가
[ ] 시작 전 설정 schema, 기본값, 허용 범위가 명시되었는가
[ ] 호스트 설정 UI와 게스트 read-only 요약이 구현되었는가
[ ] QR/운영 패널/재접속/리셋 권한 정책이 명시되었는가
[ ] AI provider를 쓰는 경우 provider 입력과 서버 scoring context가 분리되었는가
[ ] 모바일에서 플레이 가능한가
[ ] 네트워크 끊김 상황을 고려했는가
[ ] 게임 종료 후 결과가 표시되는가
[ ] 기존 게임 테스트가 깨지지 않는가
[ ] README 또는 docs가 업데이트되었는가
```
