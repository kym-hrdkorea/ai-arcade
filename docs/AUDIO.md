# AUDIO.md - AI Arcade Sound Guide

## 방향

AI Arcade의 음향은 레트로 오락실 콘솔 감성을 기준으로 한다. BGM은 Suno에서 생성한 루프 친화 트랙을 최종 에셋으로 사용하고, 짧은 UI/게임 효과음은 Web Audio 합성음으로 관리한다.

현재 웹 앱은 제공된 `apps/web/public/audio/music/coin-jump.mp3`를 기본 배경음악으로 사용한다. BGM은 허브와 게임 로비/대기실에서만 루프 재생하고, 실제 라운드 진행/AI 추측/결과 화면에서는 배경음악을 끈다. 짧은 UI/게임 효과음은 계속 `apps/web/lib/game-audio.ts`의 Web Audio 합성음으로 관리한다.

## Suno BGM 생성 규칙

- Custom/Instrumental 모드 사용
- `Instrumental`, `no vocals`, `no lyrics`, `loop-ready`, `retro arcade`, `chiptune`, `clean mix` 명시
- 특정 게임, 작곡가, 유명 OST 이름 금지
- 60-90초 후보를 4개 이상 만든 뒤 30-60초 루프로 편집
- UI 효과음과 타이머를 가리지 않도록 과한 리드와 저역을 피함
- 상업/공개 배포 가능성이 있으면 Pro/Premier 구독 중 생성한 음원만 사용

## Suno Prompts

```txt
Title: AI Arcade Insert Coin
Style: Instrumental retro arcade lobby music, upbeat chiptune, coin-op game cabinet mood, bright square wave melody, warm 8-bit bass, light electronic drums, 92 BPM, clean loop-ready structure, intro and ending compatible for looping, playful but not noisy, no vocals, no lyrics
Use: 허브/대기 화면
```

```txt
Title: Draw Duel Sketch Rush
Style: Instrumental chiptune drawing game loop, playful human vs AI competition, bouncy arpeggios, soft pixel percussion, light tension, 104 BPM, minimal lead melody, enough space for UI sound effects, seamless loop-friendly, no vocals, no lyrics
Use: Draw Duel 드로잉 라운드
```

```txt
Title: Neural Guess Countdown
Style: Instrumental retro arcade AI thinking loop, glitchy synth pulses, ticking chip percussion, suspenseful but friendly, 116 BPM, short loop-ready tension bed, no horror, no heavy bass, no vocals, no lyrics
Use: Draw Duel AI 추측/타이머 압박
```

```txt
Title: Real or AI Photo Hunt
Style: Instrumental retro detective arcade loop, chiptune synth bass, crisp digital percussion, curious photo inspection mood, 98 BPM, clean mid-tempo groove, subtle camera-like rhythm accents, loop-ready, no vocals, no lyrics
Use: Real or AI 라운드 진행
```

```txt
Title: Pixel Victory Board
Style: Instrumental arcade result screen music, cheerful chiptune fanfare into short ranking loop, coin sparkle synths, 108 BPM, celebratory but compact, clean mix, loop-ready after the first 4 bars, no vocals, no lyrics
Use: 라운드 결과/최종 결과
```

## 파일 명명

```txt
apps/web/public/audio/music/coin-jump.mp3
apps/web/public/audio/music/ai-arcade-insert-coin.mp3
apps/web/public/audio/music/draw-duel-sketch-rush.mp3
apps/web/public/audio/music/neural-guess-countdown.mp3
apps/web/public/audio/music/real-or-ai-photo-hunt.mp3
apps/web/public/audio/music/pixel-victory-board.mp3
```

현재 적용 파일은 `coin-jump.mp3` 하나다. 아래 Suno 파일명은 추후 장면별 BGM을 다시 분리할 때 사용할 후보 규칙으로만 남긴다.

## SFX 운영 규칙

- 스트로크마다 효과음을 내지 않는다.
- 도구 선택, 전체 지우기, 제출, 정답 공개, 점수 공개처럼 명확한 액션에만 재생한다.
- 마지막 3초 타이머만 `countdown_tick`을 재생한다.
- 같은 cue는 cooldown으로 제한하고, 서버 이벤트는 `roundId`, `guessId`, `resultView` 키로 한 번만 재생한다.
- 모바일 플레이 첫 화면에서 오디오 버튼은 작은 아이콘 컨트롤로만 제공한다.

## Audio/UX Benchmark

자동 점수는 `apps/web/lib/game-audio-benchmark.ts`와 `apps/web/lib/game-audio.test.ts`에서 계산한다. 목표는 `excellent` 등급, 95점 이상이다.

| 지표 | 우수 기준 | 이유 |
| --- | ---: | --- |
| SFX cue 최대 길이 | 650ms 이하 | 입력 피드백이 다음 액션을 덮지 않게 함 |
| cue 내부 tone overlap | 동시 2개 이하 | 레트로 합성음이 뭉개지지 않게 함 |
| 같은 cue cooldown | 120ms 이상 | 버튼 연타와 서버 중복 이벤트 폭주 방지 |
| 결과/판정 cue 시작 간격 | 120ms 이상 | 정답 공개음과 개인 정오답음이 겹치지 않게 함 |
| cue envelope overlap | 80ms 이하 | 다른 의미의 효과음이 서로 마스킹되지 않게 함 |
| BGM scene transition | 300-600ms | 허브/라운드/결과 전환이 갑자기 끊기지 않게 함 |
| BGM 재생 scene | `hub`, `lobby`만 | 실제 게임 중 음악이 판단과 효과음을 가리지 않게 함 |

현재 설계 기준:

- `round_result` 또는 `answer_reveal` 뒤 개인 `correct`/`wrong` cue는 `AUDIO_VERDICT_CUE_DELAY_MS`만큼 지연한다.
- 브라우저 `AudioContext`가 잠겨 있으면 SFX를 예약하지 않고 unlock만 시도한다. 잠긴 상태에서 들어온 서버 이벤트음을 나중에 몰아서 재생하지 않는다.
- 오디오 버튼은 `isUnlocked=false` 상태를 실제 무음 상태로 보고, 첫 클릭은 음소거가 아니라 unlock으로 처리한다.
- BGM은 scene 전환 시 fade out/in 총 600ms로 바꾼다.
- BGM 파일은 `coin-jump.mp3`만 사용하며, `draw-duel-drawing`, `draw-duel-ai`, `real-or-ai-answering`, `result` scene에서는 재생하지 않는다.
