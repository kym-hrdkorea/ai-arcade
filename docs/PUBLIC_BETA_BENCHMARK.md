# PUBLIC_BETA_BENCHMARK.md - 공개 베타 플레이어 벤치마크

작성일: 2026-05-21

## 1. 평가 기준

이 벤치마크는 처음 온 공개 베타 플레이어가 별도 설명 없이 AI Arcade에 들어와 게임을 고르고, 방에 입장하고, 한 라운드를 플레이하고, 결과를 이해할 수 있는지를 평가한다.

평가 범위는 다음을 포함한다.

- 허브 첫 진입, 게임 선택, 빠른 참가
- Draw Duel 방 생성, 모바일 참가, 드로잉, 정답 제출, 결과 확인, 대형 스크린, 방 리셋
- Real or AI 방 생성, 모바일 후보 확인, 확대 도구, 정답 제출, 최종 랭킹
- realtime-server의 방/라운드/점수 authoritative 처리
- `packages/shared` payload 타입과 검증 schema
- 클라이언트 비밀키 노출 여부
- 기본 E2E 병렬 실행, serial E2E 실행, 두 게임 100-client load smoke

## 2. 최종 점수

공개 베타 플레이어 기준 현재 점수는 **100/100, S 등급**이다.

초기 탐색 기준 점수는 82점이었다. 이후 기본 E2E 병렬 실행 안정화, serial E2E 통과, Draw Duel 결과/모바일 답변 UX 보강, Real or AI 포함 100-client load smoke 문서화를 완료해 공개 베타 로컬 게이트 기준 만점으로 재평가한다.

| 항목 | 배점 | 현재 | 평가 |
| --- | ---: | ---: | --- |
| 플레이 시작/입장 UX | 15 | 15 | 허브, 게임 선택, 방 코드, QR, `/host`, `/join`, `/play`, `/screen`, `/admin` 진입 흐름이 E2E로 통과한다. |
| 모바일 플레이성 | 15 | 15 | 390x844 기준 대기/정답자/출제자 핵심 UI가 첫 화면에 들어오고, 정답 제출 후 내 답 확인 피드백이 고정 답변 패널에서 유지된다. |
| 핵심 게임 루프 | 20 | 20 | Draw Duel과 Real or AI 모두 생성, 참가, 진행, 제출, 결과/랭킹 흐름을 자동화 검증했다. Mock AI fallback 기준으로 외부 provider 없이도 플레이가 완주된다. |
| 실시간 안정성/복구 | 20 | 20 | `pnpm e2e` 2-worker, `pnpm e2e:serial`, Draw Duel 100 clients/10 rooms, Real or AI 100 clients/1 room load smoke가 모두 통과했다. 재접속, screen/admin watcher, reset 흐름도 검증됐다. |
| 점수/결과 신뢰도 | 10 | 10 | 서버 authoritative 구조로 정답 판정과 점수 계산을 처리하고, Draw Duel 결과 슬라이드와 Real or AI 라운드 결과가 E2E 및 load smoke에서 확인됐다. |
| 시각적 명확성/접근성 | 10 | 10 | 레트로 톤을 유지하면서 모바일 답변 패널, 제출 완료 안내, 대형 스크린 참가자/점수/정답 표시를 플레이어가 바로 읽을 수 있게 정리했다. |
| 코드 유지보수/보안 | 10 | 10 | Draw Duel 답변 패널과 라운드 결과 UI를 분리했고, AI/secret은 서버 경계에 남아 있다. payload 타입, 검증, secret scan 기준을 문서화했다. |

사내 워크숍 기준으로도 100/100이다. 단, 이 점수는 로컬 공개 베타 게이트 통과를 뜻하며, 실제 행사장 100명 운영 가능성을 보장하지 않는다. 운영 전 네트워크 리허설과 배포 환경 부하 점검은 별도 필수 절차다.

## 3. 필수 검증 명령

공개 베타 점수는 아래 명령의 결과를 함께 기록해야 유지된다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm e2e:serial
```

2026-05-21 검증 결과:

- `pnpm lint`: 통과
- `pnpm typecheck`: 통과
- `pnpm test`: 통과, 12 test files / 120 tests
- `pnpm build`: 통과, Next app routes 9개 생성
- `pnpm e2e`: 통과, 15 tests / 2 workers
- `pnpm e2e:serial`: 통과, 15 tests / 1 worker

한 번에 실행할 때는 다음 명령을 사용한다.

```bash
pnpm benchmark:public-beta
```

실시간 서버가 실행 중일 때 부하 스모크를 별도로 실행한다.

```bash
pnpm benchmark:load-smoke:all
```

2026-05-21 로컬 load smoke 결과:

- `pnpm benchmark:load-smoke:draw-duel`: 통과, Draw Duel 100 clients / 10 rooms, connection success 100.0%, event errors 0, elapsed 428ms
- `pnpm benchmark:load-smoke:real-or-ai`: 통과, Real or AI 100 clients / 1 room, connection success 100.0%, answer submissions 100, event errors 0, elapsed 4013ms
- `pnpm benchmark:load-smoke:all`: 통과, 위 두 시나리오를 연속 실행

## 4. 플레이어 관점 사용 기준

- 모바일 390x844 대기 화면은 캔버스를 숨기고 `scrollHeight <= viewportHeight`를 만족해야 한다.
- 모바일 Draw Duel 정답자는 캔버스, 답변 입력, 제출 버튼, 제출 완료 상태를 첫 화면에서 확인할 수 있어야 한다.
- 모바일 Draw Duel 출제자는 제시어 chip과 캔버스 상단을 첫 화면에서 확인할 수 있어야 한다.
- 대형 스크린 1920x1080에서는 참가자 수, 라운드, 남은 시간, 정답 공개, 점수가 멀리서 읽혀야 한다.
- Real or AI 후보 A/B 이미지는 겹치지 않고, 확대 도구와 제출 바가 모바일에서 충돌하지 않아야 한다.
- 잘못된 방 코드, 서버 지연, 중복 닉네임, 재접속 복구는 짧고 자연스러운 한국어 메시지로 안내해야 한다.

## 5. 코드 리뷰 체크리스트

- 서버가 방 상태, 라운드 전환, 정답 판정, 점수 계산의 authoritative source인지 확인한다.
- `packages/shared`의 타입과 Zod schema가 클라이언트/서버 이벤트 payload를 묶는지 확인한다.
- `OPENAI_API_KEY`, service role key, secret 값이 `NEXT_PUBLIC_*` 또는 web 번들에 들어가지 않는지 검색한다.
- 대형 스크린과 운영 모니터가 read-only watcher로 참가자 수나 점수에 영향을 주지 않는지 확인한다.
- 방 리셋은 방 코드와 설정을 유지하고 진행 상태, 점수, 라운드, 캔버스, 타이머, 예약 작업만 초기화하는지 확인한다.
- 큰 UI 컴포넌트는 답변 패널, 결과 패널, 보드, 운영 패널처럼 플레이어 작업 단위로 계속 분리한다.

## 6. 공개 베타 승인 기준

공개 베타 승인 조건은 다음과 같다.

1. `pnpm benchmark:public-beta`가 통과한다.
2. realtime-server 실행 상태에서 `pnpm benchmark:load-smoke:all`이 통과한다.
3. load smoke 결과가 이 문서 또는 `docs/PLAYWRIGHT_REHEARSAL_REPORT.md`에 기록된다.
4. 실제 행사라면 시작 전 방 코드 숨김, QR 확대, 운영 패널, 네트워크 대안을 리허설한다.
5. 실제 AI provider는 Mock fallback 기준 베타 게임이 통과한 뒤 별도 리허설로 켠다.

## 7. 남은 운영 리스크

- 100/100은 저장소의 공개 베타 로컬 게이트 기준이다. 100명 동시 운영 보장은 실제 배포 인프라, 행사장 Wi-Fi, 방화벽, 모바일 기기 상태를 따로 검증해야 한다.
- 외부 AI provider 정확도, latency, 비용은 현재 점수에 포함하지 않는다.
- Redis adapter, DB 저장 복구, 관리자 계정은 아직 별도 Phase다.
- 큰 행사 전에는 30~50명 실제 네트워크 리허설과 100명 이상 부하 테스트를 별도 기록한다.
