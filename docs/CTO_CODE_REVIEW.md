# CTO 관점 코드 리뷰

작성일: 2026-05-21

## MCP 확인

- Sequential Thinking MCP는 재설치 이후에도 현재 Codex 도구 검색에서 노출되지 않았다.
- 확인 쿼리:
  - `Sequential Thinking MCP sequential thinking analyze thoughts`
  - `sequential thinking`
- 결과: 0 tools
- 결론: 현재 세션에서는 Sequential Thinking MCP를 사용할 수 없다. 분석은 일반 코드 리뷰 방식으로 진행했다.

## 현재 구조 판단

- Next.js App Router는 유지했고 `/host`, `/join/[roomCode]`, `/play/[roomCode]`, `/screen/[roomCode]`, `/admin/[roomCode]`는 얇은 route wrapper로 추가했다.
- 기존 `/games/draw-duel` 경로도 유지되어 기존 허브 흐름과 호환된다.
- 대형 스크린과 운영 모니터는 `room:watch` read-only 이벤트로 방 상태를 구독한다.
- `room:watch`는 참가자를 생성하지 않으므로 스크린/운영 모니터가 플레이어 수, 출제 순서, 점수에 영향을 주지 않는다.
- 서버는 여전히 라운드, 점수, 정답 공개, stroke history의 authoritative source다.

## 리뷰 중 발견 및 조치

1. 대형 스크린 점수 표시 우선순위
   - 문제: 라운드 결과 직후 `/screen/[roomCode]` 점수 패널이 `roundState.scores`를 우선 사용해, 결과 payload의 최신 점수가 늦게 보일 수 있었다.
   - 영향: 현장 대형 스크린에서 정답 공개 이후 점수 신뢰도가 떨어질 수 있다.
   - 조치: `roundResult.scores`를 최우선으로 사용하도록 수정.
   - 검증: 워크숍 e2e에서 참가자 3명이 정답 제출 후 `정답 공개`와 score `100` 표시를 확인했다.

## 남은 리스크

1. `room:watch`는 공개 roomCode만 있으면 읽을 수 있다.
   - 현재 워크숍 MVP에는 적절하지만, 외부 공개 행사나 사내 민감 콘텐츠에는 screen/admin view token이 필요하다.

2. `/admin/[roomCode]`는 read-only 운영 모니터다.
   - 의도적으로 제어 권한을 넣지 않았다.
   - 원격 운영 제어가 필요하면 호스트 인증 또는 host token 설계가 먼저 필요하다.

3. 100명 동시 접속은 아직 보장할 수 없다.
   - 구조는 Socket.IO 서버 분리와 read-only watcher 분리로 운영 가능성은 좋아졌지만, 부하 테스트 없이 보장 문구를 쓰면 안 된다.

4. Sequential Thinking MCP / Playwright MCP 증적은 아직 확보되지 않았다.
   - MCP 자체가 현재 세션에 노출되지 않아, 감사 문서에 blocker로 유지한다.

5. 현재 워크트리에는 Draw Duel 외 `real-or-ai` 관련 기존 수정이 섞여 있다.
   - 이번 리뷰는 Draw Duel 워크숍 운영 흐름과 직접 연관된 변경을 중심으로 검토했다.

## CTO 승인 관점 결론

- 회사 워크숍 파일럿 운영 수준의 핵심 조건은 충족한다.
- 특히 진행자 방 생성, 모바일 참가, 3명 이상 표시, 대형 스크린 상태, 새로고침 복구, 예외 안내, lint/build, 키 노출 방지는 자동화 검증으로 확인됐다.
- 다음 승인 단계는 실제 행사 네트워크에서의 리허설과 50-100명 규모 load smoke test다.
