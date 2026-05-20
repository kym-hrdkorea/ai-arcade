# DESIGN.md — AI Arcade 디자인 시스템

## 1. 디자인 콘셉트

AI Arcade의 시각 콘셉트는 **레트로 게임기와 현대적 웹 UI의 결합**이다.

목표는 다음과 같다.

- 첫인상: 오락실 게임 선택 화면
- 사용성: 공공기관 교육·행사 현장에서도 쉽게 조작 가능
- 분위기: 즐겁고 직관적이며 약간의 장난스러움
- 구현 난이도: Tailwind CSS로 재현 가능한 수준
- 확장성: 게임이 추가되어도 같은 플랫폼처럼 보이는 일관성

## 2. 키워드

- Retro Arcade
- Pixel Console
- CRT Glow
- Game Cartridge
- Coin Button
- Neon Accent
- Friendly Competition
- AI vs Human

## 3. 컬러 시스템

### Primary

```txt
Arcade Navy     #101827
Console Black   #0B1020
Pixel Blue      #38BDF8
Electric Cyan   #22D3EE
```

### Secondary

```txt
Retro Purple    #8B5CF6
Joystick Red    #EF4444
Coin Yellow     #FACC15
Health Green    #22C55E
```

### Neutral

```txt
Screen White    #F8FAFC
Panel Gray      #1E293B
Line Gray       #334155
Muted Gray      #94A3B8
```

### Usage

- 배경: `Console Black`, `Arcade Navy`
- 카드: `Panel Gray`
- 주요 버튼: `Pixel Blue` 또는 `Coin Yellow`
- 위험·나가기: `Joystick Red`
- 성공·정답: `Health Green`
- 강조 텍스트: `Electric Cyan`

색은 게임별로 바꾸지 말고, 상태 표현 중심으로만 사용한다.

## 4. 타이포그래피

### 권장 폰트

```txt
영문/숫자 장식용: Press Start 2P
한글 본문: Pretendard
대체 한글: Noto Sans KR
```

실제 웹 앱에서는 Google Fonts 원본 파일을 저장소에 포함하고 `next/font/local`로 `Press Start 2P`와 `Noto Sans KR`를 로드한다. 빌드가 외부 인증서나 네트워크 상태에 의존하지 않도록 font 파일은 `apps/web/app/fonts`에서 관리한다. `font-arcade`는 로고, 숫자, 짧은 배지에만 쓰고, 한글 본문과 버튼은 Noto Sans KR 계열을 기본으로 한다.

### 적용 원칙

- 큰 타이틀과 점수판 숫자에만 픽셀 폰트 사용
- 한글 본문 전체에 픽셀 폰트 사용 금지
- 게임 진행 안내, 버튼, 채팅은 Pretendard 사용
- 모바일에서는 폰트 크기를 충분히 키워 오입력 방지

### 크기 기준

```txt
Hero Title      40~56px
Section Title   28~36px
Card Title      20~24px
Body            16~18px
Small Label     12~14px
```

## 5. 레이아웃

### 메인 허브

- 상단: AI Arcade 로고와 상태 표시
- 중앙: 한 게임씩 크게 보여주는 인터랙티브 아케이드 셀렉터
- 하단: 선택 게임과 동기화되는 빠른 참가, 도움말
- 배경: 어두운 그라데이션 + 미세한 CRT scanline 효과

게임이 늘어날 수 있으므로 첫 화면은 카드 전체 나열보다 active game 중심으로 구성한다. 좌/우 화살표, dot/tab, 키보드 방향키로 게임을 전환할 수 있어야 하며, active game의 시작 CTA가 명확해야 한다.

### 로고

- `AI Arcade`는 텍스트처럼 보이지 않고 브랜드 로고처럼 보여야 한다.
- Press Start 2P, Coin Yellow, Electric Cyan 그림자, Console Black drop shadow를 조합한다.
- 로고 보조 라벨은 `INSERT COIN`처럼 짧은 장식 문구만 허용한다.
- 로고는 허브와 게임 화면에서 재사용 가능한 컴포넌트로 관리한다.

### 게임 카드

게임 카드는 카트리지 또는 오락실 선택 패널처럼 구성한다.

필수 요소:

- 썸네일
- 게임명
- 한 줄 설명
- 예상 시간
- 인원 수
- 상태 배지
- 시작 버튼

허브의 active game 셀렉터에서는 위 요소를 한 화면에 크게 재배치한다. 개별 게임 카드 컴포넌트가 남아 있더라도 첫 화면의 기본 탐색 방식은 셀렉터다.

### 썸네일

- 모든 썸네일은 같은 캐비닛 화면 비율과 테두리 규칙을 따른다.
- Draw Duel은 캔버스, 사람 답변, AI 추측 구도가 보인다.
- Real or AI는 두 사진 후보와 돋보기/판별 콘셉트가 보인다.
- 새 외부 이미지보다 저장소 내 SVG 또는 실제 게임 스크린샷을 우선한다.

### 게임 룸

- 좌측 또는 상단: 현재 라운드, 제시어, 타이머
- 중앙: 게임 핵심 영역
- 우측 또는 하단: 참가자 목록, 점수판, 채팅·정답 입력
- 모바일: 단일 컬럼으로 전환

## 6. 컴포넌트 규칙

### 버튼

기본 버튼 스타일:

- 두꺼운 테두리
- 살짝 둥근 모서리
- 눌렀을 때 2px 아래로 이동
- hover 시 밝기 증가
- disabled 상태 명확히 표시

버튼 유형:

```txt
Primary    게임 시작, 방 만들기
Secondary  참가, 설정
Danger     나가기, 초기화
Ghost      도움말, 닫기
```

### 카드

- 배경: `Panel Gray`
- 테두리: `Line Gray`
- hover 시 테두리 `Electric Cyan`
- 그림자: 약한 glow 정도만 사용
- 내용 과밀 금지

### 입력창

- 어두운 배경
- 밝은 테두리
- 포커스 시 cyan glow
- 모바일 키보드 사용을 고려해 높이 44px 이상

### 타이머

- 라운드 핵심 정보이므로 항상 명확히 표시
- 10초 이하에서는 시각적으로 긴장감 표시
- 색상만으로 의미 전달 금지. 숫자와 문구 병행

## 7. 드로잉 캔버스 UI

캔버스는 사용자가 실제 그림판처럼 쉽게 사용해야 한다.

필수 도구:

- 펜
- 지우개
- 전체 지우기
- 선 굵기
- 남은 시간 표시

초기 MVP에서는 색상은 1~3개만 제공한다.

캔버스 배경은 흰색 또는 밝은 회색을 사용한다. 어두운 배경에 그리게 하지 않는다.

## 8. 모션

허용:

- 버튼 눌림
- 카드 hover
- 라운드 시작 카운트다운
- 정답·오답 피드백
- 점수 증가 애니메이션

금지:

- 지속적으로 흔들리는 배경
- 사용자의 클릭을 방해하는 과한 파티클
- 타이핑·읽기를 방해하는 깜빡임
- 모바일 성능을 저하시키는 복잡한 3D 효과

## 9. 접근성

- 주요 텍스트 대비 충분히 확보
- 버튼은 키보드 포커스 표시
- 색상만으로 정답·오답 구분 금지
- 모바일 터치 영역 44px 이상
- 애니메이션 최소화 옵션 고려
- 실시간 게임이라도 핵심 안내는 텍스트로 남김

## 10. 카피라이팅 톤

문구는 짧고 명확하게 작성한다.

좋은 예:

```txt
방 만들기
바로 참가
그림을 그려주세요
정답을 입력하세요
AI가 추측 중입니다
이번 라운드 승리
```

피해야 할 예:

```txt
사용자님께서는 현재 게임 진행을 위하여 아래의 입력란에 정답 후보를 작성하여 주시기 바랍니다
```

영문 장식 라벨은 게임명, `AI`, `QR`, `INSERT COIN` 같은 짧은 브랜드 표현에 한정한다. 상태, 진행, 도움말, 결과 화면 라벨은 한글을 우선한다.

```txt
좋음: 게임 선택, 준비 카운트다운, 확대 보기, 라운드 결과, 최종 결과
피함: Game Select, COUNTDOWN, MAGNIFIER, ROUND RESULT, FINAL RESULT
```

## 11. 금지 디자인

- 게임마다 완전히 다른 색상 체계
- 한글 본문에 픽셀 폰트 과다 사용
- 네온 효과 과다
- 버튼과 카드의 모양이 페이지마다 다른 구조
- 모바일에서 캔버스가 화면 밖으로 밀리는 구조
- 정보보다 장식이 우선되는 화면

## 12. 모바일 첫 화면 기준

- 390px 폭 기준 첫 viewport에서 로고, active game, 전환 버튼, 시작 CTA가 겹치지 않아야 한다.
- 빠른 참가 컨트롤은 active game과 같은 선택값을 사용하고, 첫 화면 하단 또는 바로 다음 스크롤 위치에서 자연스럽게 이어져야 한다.
- 게임 셀렉터의 좌/우 버튼과 dot/tab은 44px 이상 터치 가능한 영역을 제공한다.
- 텍스트는 버튼과 배지 안에서 잘리지 않아야 하며, 게임 수가 늘어나도 active game UI 높이가 과도하게 커지지 않아야 한다.

## 13. 참고용 이미지 수집 지침

디자인 참고 이미지는 실제 저작물을 그대로 복제하지 않는다.

수집할 때는 아래 키워드로 무드보드만 만든다.

```txt
retro arcade web UI
pixel game console dashboard
arcade cabinet interface
game cartridge menu UI
crt monitor scanline interface
```

참고 이미지는 색감, 여백, 분위기, 버튼 질감만 참고하고 로고·캐릭터·일러스트는 직접 제작한다.
