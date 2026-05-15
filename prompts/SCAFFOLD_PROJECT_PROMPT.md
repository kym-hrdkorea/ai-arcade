# SCAFFOLD_PROJECT_PROMPT.md — 프로젝트 초기 구축 프롬프트

```txt
AGENTS.md와 docs의 지침을 기준으로 AI Arcade의 초기 프로젝트 구조를 생성해라.

요구사항:
- Next.js App Router + TypeScript + Tailwind CSS 기반으로 apps/web 생성
- 실시간 서버를 분리할 수 있도록 apps/realtime-server 생성
- packages/shared 생성
- games/draw-duel 폴더 유지
- pnpm workspace 구성
- 기본 README와 .env.example 작성
- 메인 페이지에는 레트로 게임 허브의 빈 골격을 구현
- draw-duel 게임 카드가 표시되도록 game registry 구성
- 아직 복잡한 게임 로직은 구현하지 말고, 폴더 구조와 라우팅, 디자인 토큰부터 안정적으로 구축

작업 후 다음을 보고하라:
1. 생성·수정 파일
2. 실행 방법
3. 검증 결과
4. 다음 단계
```
