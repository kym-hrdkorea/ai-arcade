# Real or AI Implementation Guide

이 문서는 실제 개발을 시작할 때 지켜야 할 구조, UI, 운영 지침이다. 현재 phase에서는 코드 구현을 하지 않는다.

## 1. 구조 원칙

- 게임 ID는 `real-or-ai`를 사용한다.
- 라우트는 `/games/real-or-ai`를 사용한다.
- Socket.IO 이벤트는 `real-or-ai:*` prefix만 사용한다.
- Draw Duel의 `RoomManager`, AI guesser, stroke renderer를 재사용하지 않는다.
- Three Word Monster의 room manager와 image generator도 재사용하지 않는다.
- 새 서버 로직은 `real-or-ai-room-manager.ts`와 `real-or-ai-socket-handlers.ts`로 분리한다.
- 공통 타입, 설정 schema, payload 검증은 `packages/shared`에 둔다.
- UI 컴포넌트는 `apps/web/features/real-or-ai` 아래에 둔다.

## 2. 서버 authoritative 규칙

서버가 반드시 결정한다.

- 방 생성과 참가 가능 여부
- 호스트 권한
- 설정 변경 가능 여부
- 라운드 item 선택
- 후보 이미지 좌우 순서
- 제출 유효성
- 제출 시각
- 정답 판정
- 점수 계산
- 라운드 결과와 최종 랭킹

클라이언트는 이미지를 표시하고 사용자의 선택을 보낼 뿐, 점수와 정답을 계산하지 않는다.

## 3. 100명 방 설계 지침

최대 100명 참가를 목표로 설계하지만, 실제 운영 보장은 부하 테스트 이후에만 말한다.

- 참가자 목록과 점수판 payload는 필요한 필드만 보낸다.
- 라운드 중 제출 상세를 전체 broadcast하지 않는다.
- 제출자 본인에게는 `answer-ack`, 전체에는 `answer-count`만 보낸다.
- timer tick은 초당 1회 이하로 유지한다.
- 이미지 base64를 socket payload로 반복 전송하지 않는다.
- 후보 이미지는 public URL 또는 캐시 가능한 asset URL로 전달한다.
- 라운드 결과 시점에만 전체 제출 결과와 점수 변화를 공개한다.
- manager test에서 100명 제출을 최소 검증한다.

## 4. UI 일관성 지침

기존 `docs/DESIGN.md`를 우선한다.

- 배경은 `Console Black`/`Arcade Navy` 계열을 사용한다.
- 패널은 `Panel Gray`, 경계는 `Line Gray`를 사용한다.
- 주요 버튼은 `Pixel Blue` 또는 `Coin Yellow`를 사용한다.
- 정답은 `Health Green`, 오답은 `Joystick Red`를 사용한다.
- 사진 후보 카드만 게임별 시각 포인트로 삼고, 전체 레이아웃은 기존 게임 룸과 맞춘다.
- 버튼은 픽셀 버튼 감성을 유지하되 텍스트가 모바일에서 줄바꿈되어도 깨지지 않게 한다.
- 한글 본문에 픽셀 폰트를 쓰지 않는다.
- 사진 비교가 중요한 게임이므로 후보 이미지는 충분히 크게 보여준다.

## 5. 화면별 지침

### 허브 카드

- 제목: `Real or AI`
- 짧은 설명: `두 사진 중 진짜를 빠르게 찾아 점수를 쌓는 사진 판별 게임`
- 태그 후보: `realtime`, `photo`, `quiz`, `host-mode`
- 최대 인원: 100명
- 상태: 행사/테스트 플레이 가능한 현재 단계에서는 `beta`

### 로비

- 호스트에게만 설정 패널을 보여준다.
- 게스트에게는 설정 요약과 대기 문구를 보여준다.
- QR 영역은 운영 패널 안에서 접혀 있어야 한다.
- 100명 방에서는 참가자 목록이 길어질 수 있으므로 스크롤 가능한 compact list를 사용한다.

### 플레이

- 후보 이미지는 A/B 또는 좌/우로 표시하되, "실제/AI" 라벨은 결과 전까지 표시하지 않는다.
- 참가자가 제출하면 선택 잠금 상태를 명확히 보여준다.
- 제출 후에도 다른 참가자의 정답 여부는 공개하지 않는다.
- 남은 시간이 3초 이하일 때 숫자와 문구로 긴장감을 준다.

### 라운드 결과

- 정답 후보에 명확한 테두리와 라벨을 표시한다.
- 이번 라운드 최고 득점자를 보여준다.
- 내 선택, 정답 여부, 획득 점수를 보여준다.
- 호스트만 다음 라운드 버튼을 누를 수 있다.

### 최종 결과

- 최종 랭킹은 상위권을 크게, 전체 참가자는 스크롤 목록으로 표시한다.
- 동점자는 공동 순위로 표시한다.
- 누적 점수와 정답 수를 함께 보여준다.

## 6. 오류 메시지 초안

```txt
방이 가득 찼어요.
호스트만 바꿀 수 있어요.
진행 중에는 설정을 바꿀 수 없어요.
이미 제출했어요.
제출 시간이 지났어요.
이미지를 불러오지 못했어요.
라운드 이미지가 부족해요.
잠시 후 다시 시도해 주세요.
```

## 7. 테스트 지침

최소 테스트:

- 설정 기본값과 허용 범위
- 5/10/15/30/45/60초 보기 시간 검증
- 라운드 수가 manifest item 수를 넘을 때 시작 실패
- 후보 순서가 라운드마다 서버에서 섞이는지 검증
- 정답 시 speed multiplier 점수 계산
- 오답과 미제출 0점 처리
- 라운드당 중복 제출 거절
- 100명 참가와 제출 처리 단위 테스트
- rejoin payload에 정답 정보가 노출되지 않는지 검증
- reset 시 설정 유지와 점수 초기화 검증
- public UI에 `mock`, `provider`, `asset phase` 같은 개발 용어가 노출되지 않는지 검증

회귀 검증:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

실시간 서버 검증:

```bash
pnpm --filter realtime-server test
pnpm --filter realtime-server load:smoke
```
