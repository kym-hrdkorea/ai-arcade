# GAME_SPEC.md - Real or AI

## 1. 게임 개요

`real-or-ai`는 제한 시간 안에 두 장의 사진 중 실제 사진을 고르는 실시간 퀴즈 게임이다. 참가자는 각 라운드마다 실제 사진과 AI 생성 사진을 비교하고, 더 빠르게 정확히 맞힐수록 높은 점수를 얻는다.

기존 AI Arcade의 레트로 게임 허브, 방 생성/참가, 호스트 설정, QR 운영 패널, 라운드 결과, 최종 랭킹 구조를 그대로 따른다.

## 2. 기본 정보

- 게임명: Real or AI / 진짜를 찾아라
- 게임 ID: `real-or-ai`
- 라우트: `/games/real-or-ai`
- 이벤트 prefix: `real-or-ai:*`
- 참가자: 최소 2명, 최대 100명
- 예상 시간: 설정 라운드 수와 라운드 시간에 따라 3~10분
- 승리 조건: 모든 라운드 종료 후 누적 점수 1위
- 핵심 행동: 두 이미지 중 실제 사진 선택
- 기본 이미지 풀: 사용자가 준비한 163장 이미지 기반

TODO: 163장이 "실제/AI 쌍 163세트"인지, "전체 이미지 163장"인지 확정해야 한다. Phase 0의 기본 정책은 두 경우를 단정하지 않고, 검수 후 실제 사진 1장과 AI 생성 사진 1장이 짝지어진 item만 playable round로 인정하는 것이다.

## 3. 라운드 흐름

1. 호스트가 방을 만든다.
2. 참가자가 방 코드 또는 QR 링크로 입장한다.
3. 호스트가 라운드 수와 라운드 제한 시간을 설정한다.
4. 호스트가 게임을 시작한다.
5. 서버가 manifest에서 라운드 아이템을 랜덤 순서로 선택한다.
6. 각 라운드마다 실제 사진 1장과 AI 생성 사진 1장을 무작위 좌우 순서로 공개한다.
7. 참가자는 제한 시간 안에 실제 사진이라고 생각하는 이미지를 선택한다.
8. 서버가 제출 시각과 선택값을 기준으로 라운드 점수를 계산한다.
9. 라운드 종료 시 정답 이미지, 참가자별 점수 변화, 해당 라운드 최고 득점자를 공개한다.
10. 모든 라운드가 끝나면 누적 최종 랭킹을 표시한다.

## 4. 호스트 설정

설정은 호스트만 `waiting` 상태에서 변경할 수 있다. 서버가 설정 schema와 허용 범위를 검증한다.

```txt
roundCount: 기본 10, 허용 1~playableRoundCount
roundDurationSeconds: 기본 45, 허용 5 | 10 | 15 | 30 | 45 | 60
shuffleMode: 기본 random, 허용 random
answerLockMode: 기본 first-submit, 허용 first-submit
```

운영 원칙:

- 라운드 수는 사용 가능한 manifest item 수보다 클 수 없다.
- `playableRoundCount`는 검수 통과 item 수로 계산한다.
- 보기 시간은 5/10/15/30/45/60초를 제공하고 기본값은 45초다.
- 참가자 화면에는 현재 설정 요약만 read-only로 표시한다.
- QR 입장은 호스트 운영 패널 안에서 기본 접힘 상태로 제공한다.
- 방 리셋은 방 코드와 설정을 유지하고 점수, 라운드, 제출, 타이머만 초기화한다.
- 진행 중 설정 변경 요청은 `진행 중에는 설정을 바꿀 수 없어요.`로 거절한다.

## 5. 상태

```txt
waiting
countdown
answering
round-result
final-result
```

서버가 방 상태, 라운드 전환, 타이머, 정답 판정, 점수 계산의 authoritative source다.

## 6. 점수 규칙

기본 점수는 정답 시 100점이다. 빠르게 맞힐수록 최대 1.5배까지 보너스 배율이 붙는다.

```txt
baseScore = 100
remainingRatio = remainingMilliseconds / roundDurationMilliseconds
speedMultiplier = 1 + (0.5 * remainingRatio)
roundScore = Math.round(baseScore * speedMultiplier)
```

예시:

- 라운드 시작 직후 정답: 약 150점
- 제한 시간의 절반 지점 정답: 약 125점
- 제한 시간 끝 무렵 정답: 약 100점
- 오답 또는 미제출: 0점

세부 규칙:

- 참가자는 라운드당 1회만 제출할 수 있다.
- 첫 제출 이후 선택 변경은 허용하지 않는다.
- 제출 시각은 클라이언트 시간이 아니라 서버 수신 시각으로 계산한다.
- 타임아웃 이후 도착한 제출은 무효 처리한다.
- 동점 최종 순위는 `누적 점수`, `정답 수`, `평균 정답 소요 시간` 순으로 정렬한다.
- 그래도 같으면 공동 순위로 표시한다.

## 7. 이미지 데이터 규칙

이미지 파일 자체는 Phase 0에서 추가하지 않는다. 실제 개발 전 `assets/README.md`의 private manifest 계약과 public payload 계약을 확정한다.

서버 내부 라운드 item은 다음 정보를 가져야 한다.

```ts
export type RealOrAiImageCandidate = {
  id: string;
  src: string;
  width: number;
  height: number;
  sourceType: "real" | "ai";
  alt: string;
};

export type RealOrAiRoundItem = {
  id: string;
  title?: string;
  candidates: [RealOrAiImageCandidate, RealOrAiImageCandidate];
  correctCandidateId: string;
};
```

클라이언트 public payload에는 `sourceType`과 `correctCandidateId`를 포함하지 않는다. 정답 정보는 라운드 결과 공개 시점에만 전송한다.

Phase 0 이미지 정책:

- 각 item은 후보 이미지 2장만 가진다.
- 후보 중 정확히 1장은 `real`, 정확히 1장은 `ai`여야 한다.
- 정답은 항상 `real` 후보의 id다.
- 파일명에는 `real`, `ai`, `correct`, `answer` 같은 힌트를 넣지 않는다.
- 163장이 전체 이미지 수라면 완성된 쌍만 playable round로 계산한다.
- 163장이 라운드 쌍 수라면 최대 163개 playable round로 계산한다.

## 8. Socket.IO 이벤트 초안

모든 게임 전용 이벤트는 `real-or-ai:*` prefix만 사용한다. 다른 게임의 manager, handler, 이벤트 payload를 재사용하지 않는다.

클라이언트 -> 서버:

```txt
real-or-ai:room-create
real-or-ai:room-join
real-or-ai:room-rejoin
real-or-ai:room-leave
real-or-ai:settings-update
real-or-ai:game-start
real-or-ai:answer-submit
real-or-ai:next-round
real-or-ai:round-skip
real-or-ai:room-reset
```

서버 -> 클라이언트:

```txt
real-or-ai:room-state
real-or-ai:settings-updated
real-or-ai:countdown
real-or-ai:round-start
real-or-ai:answer-ack
real-or-ai:answer-count
real-or-ai:timer-tick
real-or-ai:round-result
real-or-ai:game-result
real-or-ai:error
```

100명 방을 고려해 제출할 때마다 전체 답변 내용을 broadcast하지 않는다. 라운드 중에는 `answer-count`처럼 제출 인원 수만 공유하고, 정답 여부와 점수는 라운드 결과에서 공개한다.

## 9. 화면 구성

### 허브 카드

- 썸네일은 레트로 CRT 화면 안에 두 장의 사진 후보가 뜬 느낌으로 제작한다.
- 게임 카드는 기존 `GameModuleMeta.guide.slides` 기반 도움말 모달을 사용한다.
- 예상 시간, 최대 100명, `beta` 상태 배지를 표시한다.

### 로비

- 방 코드
- 참가자 수와 최대 인원
- 호스트 전용 게임 설정 패널
- 게스트 read-only 설정 요약
- 호스트 운영 패널 안의 QR 입장 영역
- 시작 버튼

### 플레이 화면

- 상단: 라운드 번호, 남은 시간, 제출 현황
- 중앙: 실제/AI 후보 이미지 2장
- 하단 또는 측면: 참가자 점수판, 내 제출 상태
- 모바일: 이미지 2장을 세로로 배치하고 선택 버튼을 44px 이상 터치 영역으로 제공

### 라운드 결과

- 정답 이미지 강조
- 두 후보의 실제/AI 라벨 공개
- 내 정답 여부와 획득 점수
- 라운드 최고 득점자
- 현재 상위 랭킹
- 호스트 전용 다음 라운드 버튼

### 최종 결과

- 최종 랭킹
- 누적 점수, 정답 수, 평균 정답 시간
- 공동 순위 표시
- 다시 시작 또는 허브로 이동

## 10. UI 톤

- 기존 `docs/DESIGN.md`의 레트로 게임기, 픽셀 버튼, 어두운 패널, cyan/yellow 강조를 따른다.
- 사진 비교가 핵심이므로 이미지 영역은 장식보다 선명도와 크기를 우선한다.
- 정답은 `Health Green`, 오답은 `Joystick Red`, 제한 시간 임박은 숫자와 문구를 함께 사용한다.
- 한글 본문에는 픽셀 폰트를 남용하지 않는다.
- 게임마다 완전히 다른 색상 체계를 만들지 않는다.
- public UI에는 `mock`, `provider`, `asset phase` 같은 개발 용어를 노출하지 않는다.

## 11. 예외 처리

- 참가자가 2명 미만이면 시작할 수 없다.
- 참가자가 100명을 초과하면 `방이 가득 찼어요.`로 입장을 거절한다.
- manifest item이 부족하면 시작할 수 없다.
- 라운드 중 연결이 끊긴 참가자는 `disconnected` 상태로 표시하고, 같은 브라우저 재접속 시 현재 공개 상태와 내 제출 여부를 복구한다.
- 재접속 payload에는 현재 설정, 라운드 번호, 공개 후보 이미지, 제출 여부, 점수판을 포함한다.
- 아직 공개되지 않은 정답 정보는 재접속 payload에 포함하지 않는다.

## 12. MVP 완료 기준

```txt
[ ] 게임 폴더와 명세 작성
[ ] 이미지 manifest 형식 확정
[ ] 게임 registry 메타데이터 추가
[ ] 공유 타입과 설정 schema 추가
[ ] 별도 RealOrAiRoomManager 추가
[ ] 별도 real-or-ai socket handler 추가
[ ] 방 생성/참가/재접속/리셋 구현
[ ] 호스트 설정과 게스트 read-only 요약 구현
[ ] 랜덤 라운드 선택과 후보 순서 섞기 구현
[ ] 라운드 타이머와 제출 잠금 구현
[ ] 속도 배율 점수 계산 구현
[ ] 라운드 결과와 최종 랭킹 구현
[ ] 모바일 플레이 확인
[ ] 100명은 보장하지 않고 부하 테스트 결과를 별도로 기록
[ ] pnpm lint, pnpm typecheck, pnpm test, pnpm build, pnpm e2e 통과
```
