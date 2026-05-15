# REVIEW_PROMPT.md — Codex 점검 프롬프트

```txt
현재 AI Arcade 저장소를 점검해라.

점검 기준:
- AGENTS.md 준수 여부
- docs/DESIGN.md 디자인 일관성
- docs/GAME_MODULE_SPEC.md 모듈 구조 준수
- 실시간 이벤트 payload 타입 안정성
- 클라이언트와 서버 책임 분리
- API 키 노출 위험
- 모바일 사용성
- 100명 내외 행사 운영을 고려한 병목 가능성
- 테스트·빌드 명령 실행 가능성

출력 형식:
1. 심각도 높은 문제
2. 중간 수준 문제
3. 개선 제안
4. 바로 수정 가능한 항목
5. 수정에 시간이 필요한 항목
```
