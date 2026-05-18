# GAME_SPEC.md — 3 Worded Monster

## 1. 게임 개요

`three-word-monster`는 참가자가 각자 세 단어를 제출하면 AI 이미지 생성기가 같은 조건으로 괴물 이미지를 만들고, 참가자들이 자기 괴물을 제외한 작품에 투표해 최다 득표자를 WINNER로 뽑는 실시간 파티 게임이다.

## 2. 기본 규칙

- 게임명: 3 Worded Monster / 3 단어 괴물
- 라우트: `/games/three-word-monster`
- 참가자: 최소 2명, 최대 10명
- 기본 참가 방식: 개인 참가. 닉네임은 팀명처럼 사용할 수 있다.
- 승리 조건: 자기 괴물을 제외한 투표에서 최다 득표
- 동점 처리: 최다 득표자가 여러 명이면 공동 WINNER

## 3. 진행 흐름

1. 호스트가 방을 만든다.
2. 참가자가 방 코드 또는 초대 링크로 입장한다.
3. 호스트가 게임을 시작한다.
4. 모든 참가자가 정확히 3개의 단어를 제출한다.
5. 서버가 참가자별 괴물 이미지 생성을 요청한다.
6. 생성된 괴물 갤러리를 공개한다.
7. 참가자는 자기 괴물을 제외하고 하나에 투표한다.
8. 모두 투표하면 결과를 공개한다.
9. 최다 득표 괴물을 WINNER로 표시한다.

## 4. 상태

```txt
waiting
word-submission
image-generating
voting
revealing
result
```

서버가 상태 전환과 투표 검증의 authoritative source다.

## 5. Socket.IO 이벤트

모든 게임 전용 이벤트는 `three-word-monster:*` prefix를 사용한다.

클라이언트 → 서버:

```txt
three-word-monster:room-create
three-word-monster:room-join
three-word-monster:room-rejoin
three-word-monster:room-leave
three-word-monster:game-start
three-word-monster:words-submit
three-word-monster:vote-submit
three-word-monster:room-reset
```

서버 → 클라이언트:

```txt
three-word-monster:room-state
three-word-monster:game-start
three-word-monster:image-ready
three-word-monster:voting-start
three-word-monster:vote-submitted
three-word-monster:result
three-word-monster:error
```

## 6. 이미지 생성 provider

v1 기본 provider는 `mock`이다. 실제 OpenAI 이미지 생성은 서버 환경변수로만 켠다.

```txt
THREE_WORD_MONSTER_IMAGE_PROVIDER=mock
THREE_WORD_MONSTER_IMAGE_MODEL=gpt-image-2
THREE_WORD_MONSTER_IMAGE_SIZE=1024x1024
OPENAI_API_KEY=
```

클라이언트는 이미지 provider를 직접 호출하지 않는다. 생성 이미지는 v1에서 room memory에만 저장하고 장기 보관하지 않는다.

## 7. 안전 프롬프트

서버는 모든 참가자에게 같은 구조의 프롬프트를 적용한다.

```txt
You are the image director for a Korean arcade party game called "3 Worded Monster".
Create one original monster character based on exactly these three keywords:

1. "{word1}"
2. "{word2}"
3. "{word3}"

Core art direction:
- Make the monster spooky and powerful, but also cute, playful, and collectible like an arcade mascot toy.
- The result must be family-safe: thrilling, not disturbing.
- Use a consistent polished arcade fantasy concept-art style for every player.
- Centered full-body monster, clean simple background, strong readable silhouette, high detail.

Keyword focus rules:
- All three keywords must be clearly visible in the monster design.
- Do not treat the keywords as separate objects floating around the monster.
- Fuse the three concepts into one coherent creature.
- Give each keyword a distinct visual role, such as silhouette/body shape, horns/limbs, skin texture, armor, color pattern, tail, wings, held prop, magical power, or base/environment.
- Avoid generic monsters if a keyword can be shown through a specific feature.
- If a keyword is abstract, translate it into a clear visual motif.

Composition rules:
- One monster only.
- No readable text anywhere in the image.
- No logos, UI, captions, labels, watermarks, or speech bubbles.
- Same composition and image size for all players.

Safety rules:
- No sexual content, nudity, fetish elements, or suggestive anatomy.
- No graphic gore, exposed organs, realistic injury, or disturbing violence.
- Do not depict real public figures or copyrighted characters.
- Keep the monster visually impressive, competitive, and suitable for a party game.
```

## 8. 검증 기준

- 10명 제한
- 정확히 3단어 제출 검증
- 자기 괴물 투표 금지
- 중복 투표 금지
- 모두 투표 시 결과 전환
- 동점 공동 WINNER 처리
- mock 이미지 provider fallback
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
