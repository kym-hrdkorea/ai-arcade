# Real or AI Phase 0 - Inventory and Manifest Readiness

Phase 0은 실제 개발 준비 단계다. 이미지는 추가하지 않고, `real-or-ai`가 나중에 163장 이미지 풀을 안전하게 랜덤 출제할 수 있도록 이미지 인벤토리 규칙, manifest 계약, 검수 기준, 다음 phase 진입 조건을 확정한다.

## 결정된 기본 정책

- 실제 앱 동작은 만들지 않는다.
- 웹 UI, 서버 로직, 게임 registry는 추가하지 않는다.
- 실제 이미지 파일은 저장소에 추가하지 않는다.
- 플레이 가능한 라운드 단위는 `실제 사진 1장 + AI 생성 사진 1장`을 가진 `round item`이다.
- 163장이 전체 이미지 수인지 라운드 쌍 수인지는 아직 단정하지 않는다.
- 검수 후 짝이 완성된 item만 playable round로 인정한다.
- 이후 라운드 수 설정은 `1 ~ playableRoundCount` 범위로 제한한다.

## 산출물

- `assets/README.md`: private manifest 계약, public payload 계약, 파일명 규칙, 수동 검수 기준
- `PHASE_PLAN.md`: Phase 0 범위와 완료 기준
- `GAME_SPEC.md`: 이미지 데이터 규칙과 playable round 정책

## 검수 기준

Phase 0 문서는 다음을 만족해야 한다.

- manifest 예시가 placeholder임을 명확히 표시한다.
- manifest 예시는 실제 이미지 파일 경로처럼 오해되지 않는다.
- public payload 예시에는 `sourceType`과 `correctCandidateId`가 없다.
- “이미지 추가 없음”, “코드 구현 없음”, “registry 등록 없음” 범위가 명확하다.
- Phase 1 이후 구현자가 manifest schema를 만들 때 추가 정책 결정을 하지 않아도 된다.

## 수동 시나리오

- 163장이 전체 이미지 수인 경우: 완성된 real/ai 쌍만 playable로 계산한다.
- 163장이 라운드 쌍 수인 경우: 최대 163개 playable round로 계산한다.
- 이미지 1장이 누락된 item은 playable에서 제외한다.
- 정답 후보가 ai로 표시된 item은 검수 실패로 처리한다.
- private manifest의 정답 정보가 public payload에 남아 있으면 검수 실패로 처리한다.

## 남은 TODO

- 163장의 의미 확정: 전체 이미지 수 또는 라운드 쌍 수
- 실제 asset 저장 위치 확정
- 최소 5개 실제 후보 item 수동 검수
- Phase 1에서 registry와 placeholder route를 추가할지 여부 확정
