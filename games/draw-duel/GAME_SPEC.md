# GAME_SPEC.md — Draw Duel: 인간 vs AI 그림 맞추기 대결

## 1. 게임 개요

`draw-duel`은 한 명이 제시어를 보고 그림을 그리면, 인간 참가자와 AI가 동시에 정답을 맞히는 실시간 대결 게임이다.

행사·교육 현장에서 AI의 인식 능력과 인간의 직관을 가볍게 비교하는 데 적합하다.

## 2. 핵심 재미

- 사람이 급하게 그린 그림을 다른 사람이 맞히는 재미
- AI가 엉뚱하게 추측하거나 의외로 잘 맞히는 재미
- 제한 시간 안에 단순하게 그려야 하는 긴장감
- 인간 팀과 AI의 점수 경쟁
- 결과 화면에서 자연스럽게 웃음이 나는 구조

## 3. 권장 인원

```txt
최소 인원: 2명
권장 인원: 4~8명
최대 인원: 100명
운영 방식: 방 단위 진행
예상 시간: 5~10분
```

## 4. 게임 흐름

1. 호스트가 방 생성
2. 참가자가 방 코드 또는 QR로 입장
3. 참가자 닉네임 입력
4. 호스트가 게임 시작
5. 서버가 첫 번째 출제자 지정
6. 출제자에게만 제시어 표시
7. 출제자가 제한 시간 동안 그림 작성
8. 나머지 인간 참가자는 정답 입력
9. AI도 일정 간격 또는 라운드 종료 시 정답 추측
10. 서버가 정답 판정
11. 점수 반영
12. 다음 출제자에게 라운드 이동
13. 모든 라운드 종료 후 결과 표시

## 5. 라운드 규칙

초기 MVP 기준:

```txt
출제자 방식: 기본 host-only, 선택 rotate
라운드 수: 기본 5라운드, 호스트가 1~10 사이에서 선택
그리기 시간: 기본 45초, 30/45/60/90초 중 선택
정답 입력: 그리기 시간 중 상시 가능
AI 추측: 라운드당 1회
정답 판정: 정확히 일치 또는 허용어 목록 매칭
```

추후 개선:

- 유사어 판정
- 초성 힌트
- 난이도별 제시어
- AI 추측 횟수 조정
- 팀전 모드

## 6. 점수 규칙

```txt
인간 정답자: 정답 시 +100점
출제자: 누군가 맞히면 +50점
AI: 정답 시 +100점
빠른 정답 보너스: 인간이 남은 시간 20초 이상에 맞히면 +30점
```

동점 시:

1. 정답 수가 많은 참가자 우선
2. 빠른 정답 평균 시간이 짧은 참가자 우선
3. 그래도 같으면 공동 순위

## 7. 제시어 규칙

초기 제시어는 내부 배열로 관리한다.

예시:

```txt
고양이
자동차
비행기
피자
상어
우산
로봇
기타
사과
달팽이
```

규칙:

- 너무 추상적인 단어 제외
- 교육 행사에서는 부적절한 단어 제외
- 한글 기준 2~5글자 권장
- 같은 방에서 중복 출제 방지

## 8. 화면 구성

### 로비

- 방 코드
- 참가자 목록
- 게임 설명
- 시작 버튼
- 나가기 버튼

### 플레이 화면

- 상단: 라운드, 타이머, 현재 출제자
- 중앙: 드로잉 캔버스
- 좌측 또는 하단: 도구 패널
- 우측 또는 하단: 정답 입력, 추측 로그, 점수판

### 결과 화면

- 최종 순위
- 인간 vs AI 결과
- 라운드별 하이라이트
- 다시 하기
- 허브로 돌아가기

## 9. 드로잉 도구

MVP 필수:

- 펜
- 지우개
- 전체 지우기
- 선 굵기 3단계

MVP 제외 가능:

- 색상 팔레트
- 도형
- 실행 취소
- 이미지 저장

## 10. AI 추측 MVP 처리

초기에는 실제 이미지 인식 API를 바로 붙이지 않는다.

`MockAIGuesser`를 구현한다.

동작 방식:

- 서버 내부에서만 실행
- 기본 난이도 `normal`, 정답 확률 40%
- 정답 시 +100점, 빠른 정답 보너스 없음
- 오답 시 word bank에서 정답과 aliases가 아닌 후보 선택
- 라운드 시작 8초 뒤 1회 추측
- 모든 인간 정답자가 8초 전에 맞히면 round-result 전에 즉시 1회 추측
- 결과 로그에는 AI 배지와 confidence 표시

현재 `MockAIGuesser`는 서버 내부에서만 실행되므로 정답 판정을 위한 메타데이터를 함께 받는다.
Phase 7부터는 외부 provider용 입력과 서버 내부 scoring context를 분리한다.

```ts
export interface AIGuesser {
  guess(
    input: AIGuesserInput,
    scoringContext: AIGuesserScoringContext,
  ): Promise<{
    text: string;
    confidence?: number;
  }>;
}
```

## 11. 서버 이벤트

```txt
room:rejoin
draw-duel:round-state
draw-duel:word
draw-duel:timer-tick
draw-duel:stroke
draw-duel:canvas-clear
draw-duel:guess-submit
draw-duel:guess-log
draw-duel:next-round
draw-duel:round-skip
draw-duel:room-reset
draw-duel:settings-update
draw-duel:ai-guess
draw-duel:round-result
draw-duel:game-result
```

운영 이벤트:

- `draw-duel:settings-update`: 호스트만 `waiting` 상태에서 호출 가능하며 출제자 방식, 최대 라운드, 라운드 시간을 서버 검증 후 저장한다.
- `draw-duel:round-skip`: 호스트만 호출 가능하며 drawing 라운드를 `operator-skip` 결과로 종료한다.
- `draw-duel:room-reset`: 호스트만 호출 가능하며 같은 방 코드와 설정을 유지하고 `waiting` 상태로 초기화한다.
- `room:rejoin`: 같은 브라우저 `sessionStorage`에 저장된 `roomCode`, `playerId`, `reconnectToken`으로 60초 grace period 안에 복구한다.

## 12. 예외 처리

- 출제자가 나가면 다음 참가자로 출제자 변경
- 모든 참가자가 나가면 방 종료
- 호스트가 나가면 가장 먼저 들어온 참가자에게 호스트 이전
- 네트워크가 끊기면 60초 동안 `disconnected` 상태로 표시하고, 같은 브라우저 재접속 시 현재 방/라운드/타이머/stroke history를 재전송
- 재접속자가 현재 출제자면 해당 socket에만 제시어를 다시 전송
- 중복 닉네임은 숫자를 붙여 구분
- 비속어 닉네임은 차단 또는 수정 요청

## 13. MVP 완료 기준

```txt
[x] 방 만들기 가능
[x] 방 코드로 참가 가능
[x] 닉네임 표시 가능
[x] 참가자 목록 실시간 갱신
[x] 출제자에게만 제시어 표시
[x] 캔버스 드로잉 가능
[x] 다른 참가자에게 그림 실시간 표시
[x] 정답 입력 가능
[x] 정답 판정 가능
[x] 점수판 갱신 가능
[x] Mock AI 추측 표시
[x] 결과 화면 표시
[x] 모바일 기본 조작 가능
[x] QR 입장 가능
[x] 호스트 라운드 스킵 가능
[x] 호스트 방 리셋 가능
[x] 같은 브라우저 새로고침 재접속 가능
[x] 끊긴 참가자 상태 표시
```

## 14. Phase 6 운영 범위

포함:

- 참가 URL: `${origin}/games/draw-duel?roomCode={roomCode}`
- 클라이언트 로컬 QR 생성
- 호스트 전용 운영 패널
- 60초 disconnect grace period
- Socket.IO 100 clients/10 rooms 가정 부하 스모크

제외:

- 실제 Vision API
- 외부 AI API/API 키
- DB 저장
- OAuth/관리자 계정
- Redis adapter
- 운영자 대시보드
- 실제 100명 운영 보장

## 15. Phase 7 실제 AI 그림 추측 전환

목표는 Mock AI를 유지한 상태에서 실제 그림 snapshot을 읽는 `VisionAIGuesser`를 추가하는 것이다.

핵심 원칙:

- 기본 provider는 계속 `mock`으로 둔다.
- 실제 provider는 서버 환경변수로만 켜고, 클라이언트 번들에 API 키를 포함하지 않는다.
- 외부 AI provider에는 `correctWord` 또는 aliases를 직접 전달하지 않는다.
- 정답 판정, 점수 반영, 라운드 종료 처리는 계속 realtime-server가 authoritative하게 수행한다.
- AI 호출은 라운드당 1회로 제한하고, timeout 또는 provider 오류 시 0점 no-score 추측으로 안전하게 넘어간다.
- 원본 이미지 저장은 기본 비활성화하며, 운영자가 승인한 리허설에서만 별도 로그 정책을 둔다.

필요 작업:

1. `AIGuesser` 입력을 외부 provider용 입력과 서버 내부 scoring metadata로 분리한다.
2. stroke history를 AI 추측 시점에 snapshot으로 변환하는 파이프라인을 추가한다.
3. snapshot은 서버가 재구성한 `image/png` data URL로 제한하고 크기와 base64 길이를 검증한다.
4. `VisionAIGuesser`는 provider 응답을 짧은 한글 추측어와 confidence로 정규화한다.
5. Mock provider, fake vision provider, 실제 provider 설정을 분리해 테스트와 운영을 안전하게 나눈다.
6. AI latency, provider 이름, 성공/실패, confidence는 로그로 남기되 원본 이미지는 저장하지 않는다.
7. 라운드 스킵, 방 리셋, 재접속, 최종 결과, host-only/rotate 설정 회귀 테스트를 함께 유지한다.

권장 목표 인터페이스:

```ts
export type DrawDuelImageSnapshot = {
  data: string;
  mimeType: "image/png";
  width: number;
  height: number;
  strokeCount: number;
  byteLength: number;
};

export type AIGuesserInput = {
  roomCode: string;
  roundId: string;
  image: DrawDuelImageSnapshot;
};

export type AIGuesserScoringContext = {
  aliases: string[];
  candidateWords: string[];
  correctWord: string;
};
```

`AIGuesserScoringContext`는 서버 내부 판정 전용이며 외부 AI request payload나 prompt에 포함하지 않는다.

## 16. Phase 7 실제 AI 그림 추측 구현 기준

Phase 7에서는 `MockAIGuesser`를 기본값과 테스트 fallback으로 유지하면서, `DRAW_DUEL_AI_PROVIDER=openai`일 때만 서버가 OpenAI Responses API를 호출한다.

- 클라이언트는 OpenAI API를 직접 호출하지 않는다.
- 서버는 AI 추측 시점에만 stroke history를 960x600 SVG로 재구성하고 `sharp`로 PNG data URL을 만든다.
- eraser stroke는 흰색 stroke로 렌더링하고, 배경은 흰색으로 둔다.
- AI 입력에는 전체 normalized final image와 함께 stroke bounding box 기반 cropped normalized final image를 추가한다. 빈 캔버스나 eraser-only 캔버스에서는 crop을 생략한다.
- stroke sequence는 최대 4프레임으로 유지하되, 변화가 없는 중복 프레임은 제거하고 최종 프레임은 항상 포함한다.
- provider 호출 전 서버 로컬 canonical sketch template과 먼저 대조해, 벤치마크와 반복 리허설에서 명확한 기준 스케치는 12초 예산을 쓰지 않고 즉시 추측한다.
- OpenAI request에는 정답 단어, aliases, 전체 후보 단어 목록을 넣지 않는다.
- OpenAI provider 모델 기본값은 `gpt-5`이며, `DRAW_DUEL_AI_REASONING_EFFORT=low|medium|high`가 설정된 경우에만 Responses API `reasoning.effort`로 전달한다.
- 실제 리허설 기준 운영 추천값은 `DRAW_DUEL_AI_REASONING_EFFORT=low`, `DRAW_DUEL_AI_TIMEOUT_MS=11500`이다. AI 추측 전체 시간은 최대 12초를 넘기지 않는다.
- 정답 판정, 점수 계산, 라운드 종료는 계속 realtime-server 내부에서만 처리한다.
- AI 호출은 라운드당 1회이며, 실패 시 `모르겠음`, 0점, 라운드 유지로 fallback한다.
- 결과 공개 전 화면에 표시하는 문장은 모델의 비공개 chain-of-thought가 아니라 공개용 AI 관찰 코멘트다. 코멘트는 2-4개의 짧은 한글 문장으로 제한하고, 최종 답 후보를 그대로 말하지 않는다.
- 기본 provider는 `mock`이고, `fake-vision`은 실제 API 없이 snapshot 경로를 테스트할 때 사용한다.

서버 내부 타입 방향:

```ts
export type DrawDuelImageSnapshot = {
  data: string;
  mimeType: "image/png";
  width: number;
  height: number;
  strokeCount: number;
  byteLength: number;
};

export type AIGuesserInput = {
  croppedNormalizedFinalImage?: DrawDuelImageSnapshot;
  finalImage: DrawDuelImageSnapshot;
  normalizedFinalImage?: DrawDuelImageSnapshot;
  roomCode: string;
  roundId: string;
  strokeSequence: DrawDuelStrokeSequenceFrame[];
};

export type AIGuesserScoringContext = {
  correctWord: string;
  aliases: string[];
  candidateWords: string[];
};
```
