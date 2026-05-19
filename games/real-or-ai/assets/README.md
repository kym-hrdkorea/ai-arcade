# Real or AI Assets Guide

이 문서는 `real-or-ai` Phase 0의 이미지 인벤토리 규칙과 manifest 계약을 정의한다. Phase 0에서는 실제 이미지 파일을 추가하지 않고, 웹 UI, 서버 로직, 게임 registry도 구현하지 않는다.

## 1. Phase 0 범위

포함:

- 이미지 인벤토리 규칙 확정
- private manifest 계약 확정
- public payload에서 정답 정보 제거 규칙 확정
- 이미지 검수 체크리스트 확정
- placeholder manifest 예시 작성

제외:

- 실제 이미지 파일 추가
- `apps/web/public` asset 추가
- 게임 registry 등록
- 라우트, UI, realtime-server 구현
- 실제 manifest parser 또는 validation code 작성

## 2. 라운드 item 정의

실제 플레이 가능한 한 라운드는 `round item` 1개로 표현한다.

- 각 item은 후보 이미지 2장만 가진다.
- 후보 중 정확히 1장은 `sourceType: "real"`이다.
- 후보 중 정확히 1장은 `sourceType: "ai"`이다.
- `correctCandidateId`는 항상 `real` 후보의 id다.
- 후보 1장이 누락되거나, 두 후보가 모두 real/ai이면 playable item이 아니다.
- 정답 후보가 ai로 표시된 item은 검수 실패다.

163장 이미지 풀 해석:

- 163장이 전체 이미지 수라면, 검수 후 완성된 real/ai 쌍만 playable round로 계산한다.
- 163장이 라운드 쌍 수라면, 최대 163개 playable round로 계산한다.
- 이후 라운드 수 설정은 `1 ~ playableRoundCount` 범위로 제한한다.

## 3. 파일명 규칙

파일명만 보고 정답을 추측할 수 없어야 한다.

금지 문자열:

```txt
real
ai
answer
correct
true
fake
original
generated
```

권장 패턴:

```txt
item-001-a.webp
item-001-b.webp
item-002-a.webp
item-002-b.webp
```

실제 구현 phase에서 public asset을 쓸 경우 권장 위치:

```txt
apps/web/public/games/real-or-ai/images/
```

## 4. Private Manifest 계약

manifest는 서버 내부용 private 데이터로 취급한다. 클라이언트 초기 payload에 그대로 보내지 않는다.

필수 필드:

- `id`
- `candidates`
- `candidate.id`
- `candidate.src`
- `candidate.width`
- `candidate.height`
- `candidate.sourceType`
- `candidate.alt`
- `correctCandidateId`

선택 필드:

- `title`
- `category`
- `difficulty`
- `notes`

placeholder 예시:

```json
{
  "version": 1,
  "items": [
    {
      "id": "item-001",
      "title": "예시 주제",
      "category": "placeholder",
      "difficulty": "medium",
      "notes": "EXAMPLE ONLY - 실제 이미지 파일이 아님",
      "candidates": [
        {
          "id": "item-001-a",
          "src": "/example/real-or-ai/placeholder/item-001-a.webp",
          "width": 1200,
          "height": 800,
          "sourceType": "real",
          "alt": "예시 후보 A"
        },
        {
          "id": "item-001-b",
          "src": "/example/real-or-ai/placeholder/item-001-b.webp",
          "width": 1200,
          "height": 800,
          "sourceType": "ai",
          "alt": "예시 후보 B"
        }
      ],
      "correctCandidateId": "item-001-a"
    }
  ]
}
```

## 5. Public Payload 계약

라운드 시작 시 클라이언트에는 정답 판정 정보를 제거한 payload만 전송한다.

포함 가능:

- `roundItemId`
- `candidates`
- `candidate.id`
- `candidate.src`
- `candidate.width`
- `candidate.height`
- `candidate.alt`

포함 금지:

- `candidate.sourceType`
- `correctCandidateId`
- 정답을 유추할 수 있는 `notes`
- 파일명 또는 텍스트에 들어간 정답 힌트

public payload 예시:

```json
{
  "roundItemId": "item-001",
  "candidates": [
    {
      "id": "item-001-a",
      "src": "/example/real-or-ai/placeholder/item-001-a.webp",
      "width": 1200,
      "height": 800,
      "alt": "예시 후보 A"
    },
    {
      "id": "item-001-b",
      "src": "/example/real-or-ai/placeholder/item-001-b.webp",
      "width": 1200,
      "height": 800,
      "alt": "예시 후보 B"
    }
  ]
}
```

## 6. 이미지 준비 체크리스트

```txt
[ ] 모든 item에 후보가 정확히 2장인가
[ ] 후보 2장 중 하나만 sourceType real인가
[ ] 후보 2장 중 하나만 sourceType ai인가
[ ] correctCandidateId가 real 후보를 가리키는가
[ ] 이미지 파일명이 정답을 노출하지 않는가
[ ] 모든 candidate id가 전체 manifest에서 고유한가
[ ] 모든 item id가 전체 manifest에서 고유한가
[ ] 모든 src가 실제 파일을 가리키는가
[ ] width와 height가 입력되어 있는가
[ ] 후보 2장의 주제와 구도가 비교 가능한가
[ ] 모바일에서 식별 가능한 해상도인가
[ ] 행사 사용 권리, 초상권, 저작권이 확인되었는가
[ ] 민감하거나 부적절한 이미지가 제외되었는가
```

## 7. 수동 검수 시나리오

- 163장이 전체 이미지 수인 경우: real/ai 쌍이 완성된 item만 playable로 계산한다.
- 163장이 라운드 쌍 수인 경우: 최대 163개 playable round로 계산한다.
- 이미지 1장이 누락된 item은 playable에서 제외한다.
- 후보가 3장 이상인 item은 manifest 오류로 처리한다.
- 두 후보가 모두 real이거나 모두 ai인 item은 manifest 오류로 처리한다.
- 정답 후보가 ai로 표시된 item은 검수 실패로 처리한다.
- `sourceType` 또는 `correctCandidateId`가 public payload에 남아 있으면 검수 실패로 처리한다.

## 8. Phase 1 진입 조건

- 이미지 총량이 전체 이미지 수인지 라운드 쌍 수인지 확인한다.
- 최소 5개 item을 위 체크리스트로 수동 검수한다.
- `playableRoundCount` 산정 방식에 이견이 없어야 한다.
- 실제 asset 저장 위치를 확정한다.
- private manifest와 public payload의 필드 분리가 확정되어야 한다.
