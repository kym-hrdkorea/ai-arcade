# ADD_GAME_PROMPT.md — 새 게임 추가 프롬프트

```txt
AI Arcade에 새 게임을 추가하려고 한다.

게임명:
게임 ID:
한 줄 설명:
권장 인원:
예상 시간:
핵심 재미:
필요 기능:
AI 연동 여부:

AGENTS.md와 docs/GAME_MODULE_SPEC.md를 기준으로 다음을 수행하라.

1. games/{game-id}/GAME_SPEC.md 작성
2. game registry에 게임 메타데이터 추가
3. 게임 카드가 허브에 표시되도록 연결
4. 라우트와 기본 로비 화면 생성
5. 필요한 실시간 이벤트 초안 작성
6. 최소 테스트 또는 테스트 계획 작성
7. README 또는 docs 업데이트

새 게임 설계 체크리스트:
- 게임 시작 전 설정 schema, 기본값, 허용 범위, 수정 가능 상태를 명시할 것
- 호스트 전용 설정 컨트롤과 게스트 read-only 설정 요약을 설계할 것
- 호스트 운영 패널에 필요한 시작, 다음 진행, 스킵, 리셋 같은 운영 액션을 정의할 것
- QR 입장이 필요한 경우 호스트 화면에만 노출하고, 기본 접힘 UI와 확대 모달을 포함할 것
- 재접속 복구 payload에 포함할 public 상태와 제외할 비공개 정보를 구분할 것
- 권한 오류와 진행 중 변경 오류를 짧은 한글 메시지로 설계할 것
- AI provider를 쓰는 경우 provider 입력과 서버 내부 scoring context를 분리할 것
- 외부 AI request에 정답, aliases, 비공개 참가자 정보를 직접 넣지 말 것
- AI 호출 횟수, timeout, fallback, 비용/로그 정책을 GAME_SPEC에 명시할 것

주의:
- 기존 draw-duel 게임을 깨지 말 것
- 디자인은 docs/DESIGN.md와 일관되게 유지
- 서버 권한이 필요한 로직은 클라이언트에 두지 말 것
```
