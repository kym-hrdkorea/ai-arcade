# ARCHITECTURE.md — AI Arcade 기술 구조

## 1. 목표

AI Arcade는 이벤트·교육 현장에서 다수 사용자가 동시에 접속해 게임을 플레이하는 웹 서비스다.

초기 목표는 다음과 같다.

- 100명 내외 동시 접속을 고려한 설계
- 여러 방이 동시에 열릴 수 있는 구조
- 게임별 모듈 추가가 쉬운 구조
- 실시간 드로잉·채팅·점수판 지원
- AI API 연동 지점을 분리해 비용·보안 관리 가능
- MVP 이후 부하 테스트와 운영 모니터링을 붙일 수 있는 구조

## 2. 권장 시스템 구성

```txt
Browser
  └─ Next.js Web App
       ├─ Game Hub UI
       ├─ Game Room UI
       ├─ Drawing Canvas
       └─ Client Socket

Realtime Server
  ├─ Room Manager
  ├─ Game State Manager
  ├─ Timer Manager
  ├─ Scoring Engine
  └─ Socket Event Gateway

Database
  ├─ Game Sessions
  ├─ Rooms
  ├─ Players
  ├─ Scores
  └─ Game Results

AI Adapter
  ├─ Mock AI
  ├─ Image Guessing API Adapter
  └─ Prompt/Response Logger
```

## 3. 앱 분리 원칙

### `apps/web`

담당:

- 화면
- 라우팅
- 사용자 입력
- 캔버스 렌더링
- 서버 이벤트 송수신
- UI 상태 표시

담당하지 않음:

- 최종 점수 계산
- 정답 최종 판정
- 방 상태 원본 관리
- AI API 키 보관

### `apps/realtime-server`

담당:

- 방 생성·참가·퇴장
- 라운드 상태
- 타이머
- 실시간 이벤트 브로드캐스트
- 정답 판정
- 점수 계산
- AI 어댑터 호출

### `packages/shared`

담당:

- 공통 타입
- 이벤트 payload 타입
- Zod 스키마
- 게임 등록 메타데이터
- 공통 유틸리티

### `games/{game-id}`

담당:

- 개별 게임 명세
- 개별 게임 클라이언트 컴포넌트
- 개별 게임 서버 로직
- 게임 전용 테스트

## 4. 실시간 서버 상태 모델

```ts
type RoomState = {
  roomId: string;
  gameId: string;
  status: "waiting" | "playing" | "ended";
  hostPlayerId: string;
  players: PlayerState[];
  createdAt: string;
};

type DrawDuelRoundState = {
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  drawerPlayerId: string;
  status: "drawing" | "result";
  startedAt: string;
  endsAt: string;
};
```

정답 단어는 public round state에 포함하지 않고, 현재 출제자 socket에만
`draw-duel:word` 이벤트로 보낸다.

## 5. 동시 접속 설계 기준

초기 기준:

- 전체 접속자 100명
- 방당 최대 100명
- 10~20개 방 동시 운영 가능성 고려
- 드로잉 이벤트는 과도하게 자주 보내지 않도록 throttle 적용
- 서버는 방별 상태를 메모리에 유지하되, 결과는 DB 저장
- 장기 운영 시 Redis adapter 또는 managed realtime 서비스 확장 고려

## 6. 드로잉 데이터 처리

드로잉은 전체 이미지 파일을 매번 보내지 않는다.

권장 방식:

```ts
type DrawStrokeEvent = {
  roomCode: string;
  strokeId: string;
  playerId: string;
  points: Array<{ x: number; y: number; t: number }>;
  color: string;
  width: number;
  tool: "pen" | "eraser";
  isComplete: boolean;
};
```

원칙:

- stroke 단위 전송
- pointer move는 throttle
- 방별 메모리에 최근 500개 stroke event를 보관
- 새 참가자는 `draw-duel:stroke-history`로 현재 캔버스를 복원
- 일정 시간이 지난 stroke history는 압축 또는 snapshot화
- 이미지 AI 추측 시점에만 canvas snapshot 생성

## 7. 라운드·점수 처리

Phase 6.5 기준:

- 라운드 수는 Draw Duel 설정의 `settings.maxRounds`를 따른다.
- 라운드 시간은 Draw Duel 설정의 `settings.roundDurationSeconds`를 따른다.
- 출제자는 기본 `host-only`에서는 현재 host, `rotate`에서는 게임 시작 시점의 참가자 순서대로 정한다.
- 정답 판정과 점수 계산은 realtime-server에서만 처리
- 정답자 +100점, 남은 시간 20초 이상 정답 보너스 +30점
- 라운드 최초 정답 시 출제자 +50점
- Mock AI 정답 시 +100점, 빠른 정답 보너스는 없음
- 점수 entry는 `source: "player" | "ai"`로 인간과 AI를 구분
- 라운드 결과 이후 다음 라운드는 호스트가 버튼으로 진행
- AI 추측은 라운드당 1회만 서버 내부 `AIGuesser`를 통해 실행

## 8. AI 연동 구조

AI 기능은 직접 UI에서 호출하지 않는다.

```txt
Client
  → Realtime Server
    → AI Adapter
      → AI Provider
```

초기 MVP:

- `MockAIGuesser` 사용 완료
- 기본 난이도 `normal`, 정답 확률 40%
- 입력 이미지를 받지 않고 서버 word bank 기반 추측 반환
- 라운드 시작 8초 뒤 1회 추측하고, 인간 정답자가 모두 맞혀 빠르게 끝나면 결과 전 즉시 1회 실행
- 클라이언트는 AI를 직접 호출하지 않고 `draw-duel:ai-guess` 이벤트만 수신

확장 단계:

- `VisionAIGuesser` 추가
- AI provider에 정답 단어 또는 aliases를 직접 전달하지 않도록 provider-safe input과 서버 scoring context 분리
- canvas snapshot을 AI 추측 시점에만 서버에서 생성하거나 검증된 클라이언트 snapshot으로 수신
- snapshot mime type, 크기, base64 길이, room/round 권한 검증
- API 키는 서버 환경변수에만 저장
- AI 호출 비용 제한
- 라운드당 호출 횟수 제한
- timeout, retry 제한, circuit breaker, Mock fallback 또는 no-score 처리
- provider 이름, latency, 성공/실패, confidence 기록
- 원본 이미지 저장은 기본 비활성화

## 9. 데이터베이스 모델 초안

```prisma
model GameSession {
  id        String   @id @default(cuid())
  gameId    String
  roomCode  String
  startedAt DateTime?
  endedAt   DateTime?
  createdAt DateTime @default(now())
  players   Player[]
  rounds    Round[]
}

model Player {
  id        String @id @default(cuid())
  sessionId String
  nickname  String
  score     Int    @default(0)
  session   GameSession @relation(fields: [sessionId], references: [id])
}

model Round {
  id        String   @id @default(cuid())
  sessionId String
  word      String
  drawerId  String
  startedAt DateTime
  endedAt   DateTime?
  session   GameSession @relation(fields: [sessionId], references: [id])
}
```

## 10. 보안 원칙

- 닉네임은 길이 제한과 금칙어 필터 적용
- 방 코드는 추측이 어렵게 생성
- 클라이언트 payload는 서버에서 검증
- AI API 키는 클라이언트 번들에 포함 금지
- 관리자 기능은 별도 보호
- 채팅·정답 입력에는 XSS 방어 적용
- 과도한 이벤트 전송은 rate limit 적용

## 11. 배포 전략

MVP 단순 배포:

```txt
Vercel: Next.js web
Render/Fly.io/Railway: realtime-server
Neon/Supabase/Railway: PostgreSQL
```

내부 행사 전 운영 체크:

- 네트워크 접속 가능 여부
- 모바일 접속 가능 여부
- 동시 접속 테스트
- 방 생성·참가 테스트
- 프로젝터 화면 테스트
- QR 입장 테스트
- 운영자 리셋 기능 확인

## 12. 모니터링

최소 기록:

- 방 생성 수
- 동시 접속자 수
- 라운드 수
- 평균 지연
- socket disconnect 수
- AI 호출 수
- 오류 로그

운영 대시보드는 MVP 이후 추가한다.

## 13. 확장 방향

- 게임별 랭킹
- QR 기반 빠른 참가
- 행사 운영자 모드
- 팀전 모드
- AI 난이도 조정
- 이미지 생성 AI와 연동한 출제
- 음성 인식 게임
- PPT 발표형 게임
