import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ video: "off" });

async function waitForRealtimeReady(page: Page) {
  await expect(page.getByText("서버 연결됨")).toBeVisible();
}

function extractRoomCode(text: string) {
  const roomCode = text.match(/방 코드\s*([A-Z0-9]{6})/)?.[1];

  if (!roomCode) {
    throw new Error("Room code was not rendered.");
  }

  return roomCode;
}

function boxesOverlap(
  first: { height: number; width: number; x: number; y: number },
  second: { height: number; width: number; x: number; y: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function createRealOrAiHostRoom(browser: Browser, nickname = "real-host") {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();

  await hostPage.goto("/games/real-or-ai");
  await waitForRealtimeReady(hostPage);
  await hostPage.locator("#real-ai-create-nickname").fill(nickname);
  await hostPage.getByRole("button", { name: "방 만들기" }).click();
  await expect(hostPage.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

  const roomCode = extractRealOrAiRoomCode(await hostPage.locator("body").innerText());

  return {
    hostContext,
    hostPage,
    roomCode,
  };
}

function extractRealOrAiRoomCode(text: string) {
  const roomCode = text.match(/방 코드\s*([A-Z0-9]{6})/)?.[1];

  if (!roomCode) {
    throw new Error("Real or AI room code was not rendered.");
  }

  return roomCode;
}

test.describe("public beta UX readiness", () => {
  test("keeps a playable CTA and current help copy in the mobile hub viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/");

    const logo = page.getByTestId("arcade-logo-title");
    const selector = page.getByTestId("hub-game-selector");
    const start = page.getByRole("link", { name: "게임 시작" });
    const nextGame = page.getByRole("button", { name: "다음 게임" });

    await expect(logo).toBeInViewport();
    await expect(selector).toBeInViewport();
    await expect(start).toBeInViewport();
    await expect(nextGame).toBeInViewport();
    await expect(page.getByRole("button", { name: "바로 참가" })).toBeInViewport();
    await expect(page.getByText("함께 즐길 게임을 고르세요")).toBeVisible();
    await expect(page.locator("body")).toContainText("테스트 가능");
    await expect(page.locator("body")).toContainText("실시간");
    await expect(page.locator("body")).toContainText("QR");
    await expect(page.locator("body")).not.toContainText("준비 중");
    await expect(page.locator("body")).not.toContainText("Draft");
    await expect(page.locator("body")).not.toContainText("MVP");
    await expect(page.locator("body")).not.toContainText("TEST");
    await expect(page.locator("body")).not.toContainText("mock 이미지 provider");
    await expect(page.locator("body")).not.toContainText("asset phase");
    await expect(page.locator("body")).not.toContainText("Game Select");
    const logoFont = await logo.evaluate((element) => getComputedStyle(element).fontFamily);
    expect(logoFont).toContain("arcadeFont");
    expect(logoFont).not.toContain("bodyFont");

    await page.getByRole("button", { name: "안내" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("AI Arcade 시작 안내");
    await expect(dialog).toContainText("QR 입장");
    await expect(dialog).not.toContainText("Phase 2");
    await page.getByLabel("안내 닫기").click();
    await expect(dialog).toHaveCount(0);
  });

  test("keeps the hub game screen size stable while cycling games", async ({ page }) => {
    for (const viewport of [
      { height: 844, width: 390 },
      { height: 900, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      const screen = page.getByTestId("hub-game-screen");
      const selector = page.getByTestId("hub-game-selector");
      const info = page.getByTestId("hub-game-info");
      const actions = page.getByTestId("hub-game-actions");
      await expect(screen).toBeVisible();

      const firstBox = await screen.boundingBox();
      const firstSelectorBox = await selector.boundingBox();
      const firstInfoBox = await info.boundingBox();
      const firstActionsBox = await actions.boundingBox();
      if (!firstBox || !firstSelectorBox || !firstInfoBox || !firstActionsBox) {
        throw new Error("Hub game screen was not measurable.");
      }

      const expectedSize = {
        actionsHeight: Math.round(firstActionsBox.height),
        actionsWidth: Math.round(firstActionsBox.width),
        height: Math.round(firstBox.height),
        infoHeight: Math.round(firstInfoBox.height),
        infoWidth: Math.round(firstInfoBox.width),
        selectorHeight: Math.round(firstSelectorBox.height),
        selectorWidth: Math.round(firstSelectorBox.width),
        width: Math.round(firstBox.width),
      };
      const firstImageSource = await screen.locator("img").getAttribute("src");
      expect(firstImageSource).toContain("-arcade.webp");
      expect(firstImageSource).not.toContain("-thumbnail.svg");

      for (let count = 0; count < 2; count += 1) {
        await page.getByRole("button", { name: "다음 게임" }).click();
        const nextBox = await screen.boundingBox();
        const nextSelectorBox = await selector.boundingBox();
        const nextInfoBox = await info.boundingBox();
        const nextActionsBox = await actions.boundingBox();
        if (!nextBox || !nextSelectorBox || !nextInfoBox || !nextActionsBox) {
          throw new Error("Hub game screen disappeared while cycling games.");
        }

        expect(Math.round(nextBox.width)).toBe(expectedSize.width);
        expect(Math.round(nextBox.height)).toBe(expectedSize.height);
        expect(Math.round(nextSelectorBox.width)).toBe(expectedSize.selectorWidth);
        expect(Math.round(nextSelectorBox.height)).toBe(expectedSize.selectorHeight);
        expect(Math.round(nextInfoBox.width)).toBe(expectedSize.infoWidth);
        expect(Math.round(nextInfoBox.height)).toBe(expectedSize.infoHeight);
        expect(Math.round(nextActionsBox.width)).toBe(expectedSize.actionsWidth);
        expect(Math.round(nextActionsBox.height)).toBe(expectedSize.actionsHeight);
        const imageSource = await screen.locator("img").getAttribute("src");
        expect(imageSource).toContain("-arcade.webp");
        expect(imageSource).not.toContain("-thumbnail.svg");
      }
    }
  });

  test("opens and navigates active game guide slides from the hub selector", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Draw Duel 사용설명 열기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("방 만들기와 참가");
    await expect(dialog).toContainText("1/5");
    await expect(dialog.getByRole("button", { name: "이전" })).toBeDisabled();

    await dialog.getByRole("button", { name: "다음" }).click();
    await expect(dialog).toContainText("그리기와 맞히기");
    await expect(dialog).toContainText("2/5");

    await dialog.getByRole("button", { name: "다음" }).click();
    await expect(dialog).toContainText("인간 팀 점수");
    await expect(dialog).toContainText("인간 정답자 과반수");
    await expect(dialog).toContainText("정확히 절반은 과반수가 아님");

    await dialog.getByRole("button", { name: "이전" }).click();
    await expect(dialog).toContainText("그리기와 맞히기");

    await dialog.getByRole("button", { name: "이전" }).click();
    await expect(dialog).toContainText("방 만들기와 참가");

    for (let count = 0; count < 4; count += 1) {
      await dialog.getByRole("button", { name: "다음" }).click();
    }

    await expect(dialog).toContainText("결과 확인");
    await expect(dialog.getByRole("button", { exact: true, name: "닫기" })).toBeVisible();
    await dialog.getByRole("button", { exact: true, name: "닫기" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByTestId("hub-game-selector").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "Real or AI" })).toBeVisible();
    await page.getByRole("button", { name: "Real or AI 사용설명 열기" }).click();
    const realOrAiDialog = page.getByRole("dialog");
    await expect(realOrAiDialog).toContainText("Real or AI");
    await expect(realOrAiDialog).toContainText("방 만들기와 설정");
    await expect(realOrAiDialog).toContainText("5/10/15/30/45/60초");
    await realOrAiDialog.getByRole("button", { name: "다음" }).click();
    await expect(realOrAiDialog).toContainText("진짜 사진 고르기");
    await realOrAiDialog.getByRole("button", { name: "다음" }).click();
    await expect(realOrAiDialog).toContainText("빠른 정답 보너스");
    await expect(realOrAiDialog).toContainText("권장 45초");
    await page.keyboard.press("Escape");
    await expect(realOrAiDialog).toHaveCount(0);
  });

  test("exposes Real or AI as a testable selector item with a live join form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Draw Duel" })).toBeVisible();
    await page.getByTestId("hub-game-selector").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "Real or AI" })).toBeVisible();
    await expect(page.locator("body")).toContainText("테스트 가능");
    await expect(page.locator("body")).not.toContainText("Draft");
    await expect(page.getByLabel("게임", { exact: true })).toHaveValue("real-or-ai");

    await page.getByRole("link", { name: "게임 시작" }).click();
    await expect(page).toHaveURL(/\/games\/real-or-ai$/);
    await expect(page.getByRole("heading", { name: "Real or AI" })).toBeVisible();
    await waitForRealtimeReady(page);
    await expect(page.locator("#real-ai-create-nickname")).toBeVisible();
    await expect(page.locator("#real-ai-join-nickname")).toBeVisible();

    await page.goto("/");
    await page.getByLabel("게임", { exact: true }).selectOption("real-or-ai");
    await page.locator("#room-code").fill("abc123");
    await page.getByRole("button", { name: "바로 참가" }).click();

    await expect(page).toHaveURL(/\/games\/real-or-ai\/join\?roomCode=ABC123/);
    await waitForRealtimeReady(page);
    await expect(page.locator("body")).toContainText("ABC123");
    await expect(page.locator("#real-ai-room-code")).toHaveCount(0);
    await expect(page.locator("#real-ai-join-nickname")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("방 만들기");
  });

  test("plays Real or AI through magnifier, answers, round result, and final ranking", async ({ browser }) => {
    const host = await createRealOrAiHostRoom(browser);
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    try {
      await expect(host.hostPage.getByRole("button", { name: /QR 입장/ })).toBeVisible();
      await host.hostPage.getByRole("button", { name: /QR 입장/ }).click();
      await expect(host.hostPage.getByText("참가 링크")).toBeVisible();
      await expect(host.hostPage.getByText("/games/real-or-ai/join?roomCode=")).toBeVisible();
      await expect(host.hostPage.getByText(`roomCode=${host.roomCode}`)).toBeVisible();
      await host.hostPage.getByRole("button", { name: "크게 보기" }).click();
      await expect(host.hostPage.getByRole("dialog")).toContainText(host.roomCode);
      await host.hostPage.keyboard.press("Escape");
      await expect(host.hostPage.getByRole("dialog")).toHaveCount(0);

      await guestPage.goto(`/games/real-or-ai/join?roomCode=${host.roomCode}`);
      await waitForRealtimeReady(guestPage);
      await expect(guestPage.locator("#real-ai-room-code")).toHaveCount(0);
      await expect(guestPage.locator("body")).toContainText(host.roomCode);
      await expect(guestPage.locator("body")).not.toContainText("방 만들기");
      await guestPage.locator("#real-ai-join-nickname").fill("real-guest");
      await guestPage.getByRole("button", { name: "입장하기" }).click();
      await expect(host.hostPage.getByRole("button", { name: "게임 시작" })).toBeEnabled();

      await expect(guestPage.getByText("호스트가 시작 전 설정을 조정합니다.")).toBeVisible();
      await expect(guestPage.getByText("게임 설정")).toHaveCount(0);
      await expect(guestPage.getByRole("button", { name: /QR 입장/ })).toHaveCount(0);
      await expect(host.hostPage.locator("#real-ai-round-duration-select")).toHaveValue("45");
      await host.hostPage.locator("#real-ai-round-duration-select").selectOption("60");
      await expect(guestPage.locator("body")).toContainText(/60\s*초 제한/);

      for (let count = 0; count < 9; count += 1) {
        await host.hostPage.getByLabel("라운드 줄이기").click();
      }
      await expect(host.hostPage.locator("body")).toContainText(/1\s*라운드/);
      await host.hostPage.locator("#real-ai-round-duration-select").selectOption("5");
      await host.hostPage.locator("#real-ai-countdown-select").selectOption("3");
      await expect(guestPage.locator("body")).toContainText(/1\s*라운드/);
      await expect(guestPage.locator("body")).toContainText(/5\s*초 제한/);
      await expect(guestPage.locator("body")).toContainText(/3\s*초 준비/);

      await host.hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(host.hostPage.getByTestId("real-ai-countdown-panel")).toBeVisible();
      await expect(guestPage.getByTestId("real-ai-countdown-panel")).toBeVisible();
      await expect(guestPage.locator("body")).not.toContainText("방 코드");
      await expect(guestPage.locator("body")).not.toContainText(host.roomCode);
      await expect(guestPage.locator("body")).not.toContainText("방에 입장했습니다.");
      await expect(guestPage.locator("body")).not.toContainText("허브로");
      await expect(guestPage.locator("body")).not.toContainText("서버 연결");
      await expect(guestPage.locator("body")).not.toContainText("설정 요약");
      await expect(guestPage.locator("body")).not.toContainText("게임 설정");
      await expect(guestPage.locator("body")).not.toContainText("대기실");
      await expect(host.hostPage.getByTestId("real-ai-candidate-A")).toBeVisible({
        timeout: 6000,
      });

      await expect(guestPage.locator("body")).not.toContainText("방 코드");
      await expect(guestPage.locator("body")).not.toContainText(host.roomCode);
      await expect(guestPage.locator("body")).not.toContainText("방에 입장했습니다.");
      await expect(guestPage.locator("body")).not.toContainText("허브로");
      await expect(guestPage.locator("body")).not.toContainText("서버 연결");
      await expect(guestPage.locator("body")).not.toContainText("게임 설정");
      await expect(guestPage.locator("body")).not.toContainText("QR 입장");
      await expect(guestPage.getByRole("button", { name: "방 나가기" })).toBeInViewport();
      await expect(guestPage.getByAltText("후보 A 사진").first()).toBeVisible();
      await expect(guestPage.getByAltText("후보 B 사진").first()).toBeVisible();
      const candidateABox = await guestPage.getByTestId("real-ai-candidate-A").boundingBox();
      const candidateBBox = await guestPage.getByTestId("real-ai-candidate-B").boundingBox();
      expect(candidateABox).not.toBeNull();
      expect(candidateBBox).not.toBeNull();
      expect(boxesOverlap(candidateABox!, candidateBBox!)).toBe(false);
      await expect(guestPage.getByTestId("real-ai-candidate-A")).toBeInViewport();
      await expect(guestPage.getByTestId("real-ai-candidate-B")).toBeInViewport();
      await expect(guestPage.locator("body")).not.toContainText("이미지 없음");
      await expect(guestPage.locator("body")).not.toContainText("asset phase");
      await expect(guestPage.getByRole("button", { name: "후보 A 확대 보기" })).toBeVisible();
      await guestPage.getByRole("button", { name: "후보 A 확대 보기" }).click();
      const zoomDialog = guestPage.getByRole("dialog");
      await expect(zoomDialog).toContainText("후보 A 확대 보기");
      await expect(zoomDialog.getByAltText("후보 A 사진")).toBeVisible();
      await zoomDialog.getByRole("button", { name: "4x" }).click();
      await expect(zoomDialog.getByRole("button", { name: "4x" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(zoomDialog).not.toContainText("sourceType");
      await expect(zoomDialog).not.toContainText("correctCandidateId");
      await guestPage.getByLabel("확대 보기 닫기").click();
      await expect(zoomDialog).toHaveCount(0);

      await guestPage.getByRole("button", { name: "후보 A 선택" }).click();
      await guestPage.getByRole("button", { name: "진짜 사진 제출" }).click();
      await expect(guestPage.getByTestId("real-ai-submit-bar")).toContainText(
        "제출 완료 · 후보 A",
      );
      await expect(guestPage.getByTestId("real-ai-submit-answer")).toHaveText("제출 완료");
      await expect(guestPage.getByTestId("real-ai-submit-answer")).toBeDisabled();
      await expect(host.hostPage.locator("body")).toContainText(/1\/2|1\s*\/\s*2/);

      await host.hostPage.getByRole("button", { name: "후보 B 선택" }).click();
      await host.hostPage.getByRole("button", { name: "진짜 사진 제출" }).click();
      await expect(host.hostPage.getByText("라운드 1 / 1")).toBeVisible({ timeout: 6000 });
      await expect(host.hostPage.getByTestId("real-ai-answer-result-summary")).toBeVisible();
      await expect(host.hostPage.getByTestId("real-ai-round-result")).not.toContainText(
        "최고 득점",
      );
      await expect(host.hostPage.getByText("정답").first()).toBeVisible();
      await expect(host.hostPage.getByRole("button", { name: "점수 보기" })).toBeVisible();
      await expect(guestPage.getByText("호스트가 점수 화면으로 넘기고 있습니다.")).toBeVisible();
      await expect(host.hostPage.getByRole("button", { name: "최종 랭킹 보기" })).toHaveCount(0);

      await host.hostPage.getByRole("button", { name: "점수 보기" }).click();
      await expect(guestPage.getByTestId("real-ai-score-result-list")).toBeVisible({
        timeout: 6000,
      });
      await guestPage.reload({ waitUntil: "networkidle" });
      await expect(guestPage.getByTestId("real-ai-score-result-list")).toBeVisible({
        timeout: 6000,
      });
      await expect(guestPage.getByText("호스트가 점수 화면으로 넘기고 있습니다.")).toHaveCount(0);
      await expect(host.hostPage.getByText("이번 라운드 최고 득점")).toBeVisible();
      await expect(host.hostPage.getByRole("button", { name: "최종 랭킹 보기" })).toBeVisible();

      await host.hostPage.getByRole("button", { name: "최종 랭킹 보기" }).click();
      await expect(host.hostPage.getByRole("heading", { name: "최종 랭킹" })).toBeVisible({
        timeout: 6000,
      });
      await expect(host.hostPage.locator("body")).toContainText("real-host");
      await expect(host.hostPage.locator("body")).toContainText("real-guest");

      await host.hostPage.getByRole("button", { name: "방 리셋" }).click();
      await expect(host.hostPage.getByText("대기 중").first()).toBeVisible();
      await expect(host.hostPage.locator("body")).toContainText(host.roomCode);
      await expect(host.hostPage.locator("body")).toContainText(/1\s*라운드/);
      await expect(host.hostPage.locator("body")).toContainText(/3\s*초 준비/);
    } finally {
      await Promise.all([host.hostContext.close(), guestContext.close()]);
    }
  });

  test("keeps the Real or AI play surface inside a narrow mobile viewport", async ({
    browser,
  }) => {
    const mobileViewport = {
      height: 800,
      width: 360,
    };
    const hostContext = await browser.newContext({
      isMobile: true,
      viewport: mobileViewport,
    });
    const hostPage = await hostContext.newPage();
    const guestContext = await browser.newContext({
      isMobile: true,
      viewport: mobileViewport,
    });
    const guestPage = await guestContext.newPage();

    try {
      await hostPage.goto("/games/real-or-ai");
      await waitForRealtimeReady(hostPage);
      await hostPage.locator("#real-ai-create-nickname").fill("mobile-host");
      await hostPage.getByRole("button", { name: "방 만들기" }).click();
      await expect(hostPage.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

      const roomCode = extractRealOrAiRoomCode(await hostPage.locator("body").innerText());

      await guestPage.goto(`/games/real-or-ai/join?roomCode=${roomCode}`);
      await waitForRealtimeReady(guestPage);
      await guestPage.locator("#real-ai-join-nickname").fill("mobile-guest");
      await guestPage.getByRole("button", { name: "입장하기" }).click();

      await hostPage.getByLabel("라운드 줄이기").click();
      await hostPage.locator("#real-ai-countdown-select").selectOption("3");
      await hostPage.getByRole("button", { name: "게임 시작" }).click();
      const guestCountdownPanel = guestPage.getByTestId("real-ai-countdown-panel");
      await expect(guestCountdownPanel).toBeVisible();
      const guestCountdownBox = await guestCountdownPanel.boundingBox();
      expect(guestCountdownBox).not.toBeNull();
      expect(guestCountdownBox!.y).toBeGreaterThanOrEqual(240);
      expect(guestCountdownBox!.y + guestCountdownBox!.height).toBeLessThanOrEqual(560);
      await expect(guestPage.locator("body")).not.toContainText("방 코드");
      await expect(guestPage.locator("body")).not.toContainText(roomCode);
      await expect(guestPage.locator("body")).not.toContainText("방에 입장했습니다.");
      await expect(guestPage.locator("body")).not.toContainText("허브로");
      await expect(guestPage.locator("body")).not.toContainText("서버 연결");
      await expect(guestPage.locator("body")).not.toContainText("게임 설정");
      await expect(guestPage.locator("body")).not.toContainText("운영 패널");
      await expect(guestPage.locator("body")).not.toContainText("QR 입장");

      await expect(hostPage.getByTestId("real-ai-candidate-A")).toBeVisible({
        timeout: 6000,
      });
      await expect(guestPage.getByTestId("real-ai-candidate-A")).toBeVisible({
        timeout: 6000,
      });
      await expect(hostPage.getByTestId("real-ai-candidate-A")).toBeInViewport();
      await expect(hostPage.locator("body")).not.toContainText("설정 요약");

      await expect(guestPage.locator("body")).not.toContainText("방 코드");
      await expect(guestPage.locator("body")).not.toContainText(roomCode);
      await expect(guestPage.locator("body")).not.toContainText("방에 입장했습니다.");
      await expect(guestPage.locator("body")).not.toContainText("허브로");
      await expect(guestPage.locator("body")).not.toContainText("서버 연결");
      await expect(guestPage.locator("body")).not.toContainText("게임 설정");
      await expect(guestPage.locator("body")).not.toContainText("운영 패널");
      await expect(guestPage.locator("body")).not.toContainText("QR 입장");

      const guestCandidateFrame = guestPage.getByTestId("real-ai-candidate-A-frame");
      const guestFrameBox = await guestCandidateFrame.boundingBox();
      const guestCandidateBBox = await guestPage.getByTestId("real-ai-candidate-B").boundingBox();
      const guestSubmitBarBox = await guestPage.getByTestId("real-ai-submit-bar").boundingBox();
      const guestMagnifierButton = guestPage.getByRole("button", { name: "후보 A 확대 도구" });
      const guestZoomButton = guestPage.getByRole("button", { name: "후보 A 확대 보기" });
      const guestLeaveButton = guestPage.getByRole("button", { name: "방 나가기" });
      await expect(guestMagnifierButton).toBeInViewport();
      await expect(guestZoomButton).toBeInViewport();
      await expect(guestLeaveButton).toBeInViewport();
      const guestMagnifierButtonBox = await guestMagnifierButton.boundingBox();
      const guestZoomButtonBox = await guestZoomButton.boundingBox();
      const guestLeaveButtonBox = await guestLeaveButton.boundingBox();
      expect(guestFrameBox).not.toBeNull();
      expect(guestCandidateBBox).not.toBeNull();
      expect(guestSubmitBarBox).not.toBeNull();
      expect(guestMagnifierButtonBox).not.toBeNull();
      expect(guestZoomButtonBox).not.toBeNull();
      expect(guestLeaveButtonBox).not.toBeNull();
      expect(guestFrameBox!.width).toBeGreaterThanOrEqual(320);
      expect(guestFrameBox!.height).toBeGreaterThanOrEqual(200);
      expect(guestFrameBox!.height).toBeLessThanOrEqual(240);
      expect(guestLeaveButtonBox!.y).toBeGreaterThanOrEqual(0);
      expect(guestCandidateBBox!.y).toBeLessThan(mobileViewport.height);
      expect(guestSubmitBarBox!.y + guestSubmitBarBox!.height).toBeLessThanOrEqual(
        mobileViewport.height,
      );
      expect(boxesOverlap(guestFrameBox!, guestMagnifierButtonBox!)).toBe(false);
      expect(boxesOverlap(guestFrameBox!, guestZoomButtonBox!)).toBe(false);
      expect(boxesOverlap(guestFrameBox!, guestSubmitBarBox!)).toBe(false);

      const candidateFrame = hostPage.getByTestId("real-ai-candidate-A-frame");
      const frameBox = await candidateFrame.boundingBox();
      expect(frameBox).not.toBeNull();
      expect(frameBox!.width).toBeGreaterThanOrEqual(320);
      expect(frameBox!.height).toBeGreaterThanOrEqual(200);
      expect(frameBox!.height).toBeLessThanOrEqual(240);

      const magnifierButton = hostPage.getByRole("button", { name: "후보 A 확대 도구" });
      const zoomButton = hostPage.getByRole("button", { name: "후보 A 확대 보기" });
      const leaveButton = hostPage.getByRole("button", { name: "방 나가기" });
      await expect(magnifierButton).toBeInViewport();
      await expect(zoomButton).toBeInViewport();
      await expect(leaveButton).toBeInViewport();

      const magnifierButtonBox = await magnifierButton.boundingBox();
      const zoomButtonBox = await zoomButton.boundingBox();
      const leaveButtonBox = await leaveButton.boundingBox();
      const submitBarBox = await hostPage.getByTestId("real-ai-submit-bar").boundingBox();
      const candidateBBox = await hostPage.getByTestId("real-ai-candidate-B").boundingBox();
      const hostOperationStatusBox = await hostPage
        .getByTestId("real-ai-operation-status")
        .boundingBox();
      const hostSkipButtonBox = await hostPage.getByTestId("real-ai-skip-round").boundingBox();
      expect(magnifierButtonBox).not.toBeNull();
      expect(zoomButtonBox).not.toBeNull();
      expect(leaveButtonBox).not.toBeNull();
      expect(submitBarBox).not.toBeNull();
      expect(candidateBBox).not.toBeNull();
      expect(hostOperationStatusBox).not.toBeNull();
      expect(hostSkipButtonBox).not.toBeNull();
      expect(leaveButtonBox!.y).toBeGreaterThanOrEqual(0);
      expect(candidateBBox!.y).toBeLessThan(mobileViewport.height);
      expect(submitBarBox!.y + submitBarBox!.height).toBeLessThanOrEqual(
        mobileViewport.height,
      );
      expect(hostOperationStatusBox!.y).toBeGreaterThanOrEqual(
        submitBarBox!.y + submitBarBox!.height,
      );
      expect(boxesOverlap(frameBox!, magnifierButtonBox!)).toBe(false);
      expect(boxesOverlap(frameBox!, zoomButtonBox!)).toBe(false);
      expect(boxesOverlap(frameBox!, submitBarBox!)).toBe(false);
      expect(boxesOverlap(magnifierButtonBox!, submitBarBox!)).toBe(false);
      expect(boxesOverlap(submitBarBox!, hostSkipButtonBox!)).toBe(false);

      await magnifierButton.click();
      const inlineLens = hostPage.getByTestId("real-ai-lens-A");
      await expect(inlineLens).toBeVisible();
      const beforeLensBox = await inlineLens.boundingBox();
      expect(beforeLensBox).not.toBeNull();

      await candidateFrame.dispatchEvent("pointerdown", {
        bubbles: true,
        clientX: frameBox!.x + (frameBox!.width * 0.3),
        clientY: frameBox!.y + (frameBox!.height * 0.45),
        pointerId: 17,
        pointerType: "touch",
      });
      await candidateFrame.dispatchEvent("pointermove", {
        bubbles: true,
        clientX: frameBox!.x + (frameBox!.width * 0.72),
        clientY: frameBox!.y + (frameBox!.height * 0.58),
        pointerId: 17,
        pointerType: "touch",
      });
      await candidateFrame.dispatchEvent("pointerup", {
        bubbles: true,
        clientX: frameBox!.x + (frameBox!.width * 0.72),
        clientY: frameBox!.y + (frameBox!.height * 0.58),
        pointerId: 17,
        pointerType: "touch",
      });
      const afterLensBox = await inlineLens.boundingBox();
      expect(afterLensBox).not.toBeNull();
      expect(Math.round(afterLensBox!.x)).not.toBe(Math.round(beforeLensBox!.x));
      await magnifierButton.click();

      await zoomButton.click();
      const dialog = hostPage.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("후보 A 확대 보기");

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect(box?.width).toBeLessThanOrEqual(mobileViewport.width);
      expect(box?.height).toBeLessThanOrEqual(mobileViewport.height);
      const zoomCloseBox = await hostPage.getByTestId("real-ai-zoom-close").boundingBox();
      expect(zoomCloseBox).not.toBeNull();
      expect(zoomCloseBox!.x).toBeGreaterThanOrEqual(0);
      expect(zoomCloseBox!.y).toBeGreaterThanOrEqual(0);
      expect(zoomCloseBox!.x + zoomCloseBox!.width).toBeLessThanOrEqual(
        mobileViewport.width,
      );
      expect(zoomCloseBox!.y + zoomCloseBox!.height).toBeLessThanOrEqual(
        mobileViewport.height,
      );
      expect(zoomCloseBox!.width).toBeGreaterThanOrEqual(44);
      expect(zoomCloseBox!.height).toBeGreaterThanOrEqual(44);

      await hostPage.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);

      await hostPage.getByTestId("real-ai-candidate-B").scrollIntoViewIfNeeded();
      await expect(hostPage.getByTestId("real-ai-candidate-B")).toBeInViewport();

      await hostPage.getByTestId("real-ai-skip-round").click();
      await expect(hostPage.getByTestId("real-ai-round-result")).toBeVisible({
        timeout: 6000,
      });
      await expect(guestPage.getByTestId("real-ai-round-result")).toBeVisible({
        timeout: 6000,
      });
      await expect(hostPage.getByTestId("real-ai-answer-result-summary")).toBeInViewport();
      await expect(hostPage.getByRole("button", { name: "점수 보기" })).toBeInViewport();
      await expect(guestPage.getByText("호스트가 점수 화면으로 넘기고 있습니다.")).toBeInViewport();

      await hostPage.getByRole("button", { name: "점수 보기" }).click();
      await expect(guestPage.getByTestId("real-ai-score-result-list")).toBeVisible({
        timeout: 6000,
      });
      await expect(hostPage.getByText("이번 라운드 최고 득점")).toBeInViewport();
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()]);
    }
  });

  test("keeps Real or AI photos generous on standard mobile viewports", async ({
    browser,
  }) => {
    for (const mobileViewport of [
      { height: 844, width: 390 },
      { height: 915, width: 412 },
    ]) {
      const hostContext = await browser.newContext({
        isMobile: true,
        viewport: mobileViewport,
      });
      const hostPage = await hostContext.newPage();
      const guestContext = await browser.newContext({
        isMobile: true,
        viewport: mobileViewport,
      });
      const guestPage = await guestContext.newPage();

      try {
        await hostPage.goto("/games/real-or-ai");
        await waitForRealtimeReady(hostPage);
        await hostPage.locator("#real-ai-create-nickname").fill(
          `standard-host-${mobileViewport.width}`,
        );
        await hostPage
          .locator('form:has(#real-ai-create-nickname) button[type="submit"]')
          .click();
        await expect(hostPage.locator("#real-ai-countdown-select")).toBeVisible();

        const roomCode = extractRealOrAiRoomCode(await hostPage.locator("body").innerText());

        await guestPage.goto(`/games/real-or-ai/join?roomCode=${roomCode}`);
        await waitForRealtimeReady(guestPage);
        await guestPage.locator("#real-ai-join-nickname").fill(
          `standard-guest-${mobileViewport.width}`,
        );
        await guestPage
          .locator('form:has(#real-ai-join-nickname) button[type="submit"]')
          .click();

        await hostPage.locator("#real-ai-countdown-select").selectOption("3");
        await hostPage.getByTestId("real-ai-start-game").click();
        await expect(guestPage.getByTestId("real-ai-candidate-A")).toBeVisible({
          timeout: 6000,
        });

        await expect(guestPage.locator("body")).not.toContainText("방 코드");
        await expect(guestPage.locator("body")).not.toContainText(roomCode);
        await expect(guestPage.locator("body")).not.toContainText("방에 입장했습니다.");
        await expect(guestPage.locator("body")).not.toContainText("허브로");
        await expect(guestPage.locator("body")).not.toContainText("서버 연결");
        await expect(guestPage.locator("body")).not.toContainText("게임 설정");
        await expect(guestPage.locator("body")).not.toContainText("운영 패널");
        await expect(guestPage.locator("body")).not.toContainText("QR 입장");

        const frameABox = await guestPage.getByTestId("real-ai-candidate-A-frame").boundingBox();
        const frameBBox = await guestPage.getByTestId("real-ai-candidate-B-frame").boundingBox();
        const candidateBBox = await guestPage.getByTestId("real-ai-candidate-B").boundingBox();
        const submitBarBox = await guestPage.getByTestId("real-ai-submit-bar").boundingBox();
        const submitButton = guestPage.getByTestId("real-ai-submit-answer");
        const initialSubmitButtonBox = await submitButton.boundingBox();
        expect(frameABox).not.toBeNull();
        expect(frameBBox).not.toBeNull();
        expect(candidateBBox).not.toBeNull();
        expect(submitBarBox).not.toBeNull();
        expect(initialSubmitButtonBox).not.toBeNull();
        expect(frameABox!.width).toBeGreaterThanOrEqual(mobileViewport.width - 40);
        expect(frameABox!.height).toBeGreaterThanOrEqual(230);
        expect(candidateBBox!.y).toBeLessThan(mobileViewport.height);
        expect(submitBarBox!.y + submitBarBox!.height).toBeLessThanOrEqual(
          mobileViewport.height,
        );
        expect(boxesOverlap(frameBBox!, submitBarBox!)).toBe(false);

        await guestPage.getByRole("button", { name: "후보 A 선택" }).click();
        const selectedSubmitButtonBox = await submitButton.boundingBox();
        await submitButton.click();
        await expect(guestPage.getByTestId("real-ai-submit-bar")).toContainText(
          "제출 완료 · 후보 A",
        );
        await expect(submitButton).toHaveText("제출 완료");
        const submittedButtonBox = await submitButton.boundingBox();
        expect(selectedSubmitButtonBox).not.toBeNull();
        expect(submittedButtonBox).not.toBeNull();
        expect(selectedSubmitButtonBox!.x).toBe(submittedButtonBox!.x);
        expect(selectedSubmitButtonBox!.width).toBe(submittedButtonBox!.width);
      } finally {
        await Promise.all([hostContext.close(), guestContext.close()]);
      }
    }
  });

  test("keeps the Real or AI submit action visible on a very short mobile viewport", async ({
    browser,
  }) => {
    const mobileViewport = {
      height: 640,
      width: 360,
    };
    const hostContext = await browser.newContext({
      isMobile: true,
      viewport: mobileViewport,
    });
    const hostPage = await hostContext.newPage();
    const guestContext = await browser.newContext({
      isMobile: true,
      viewport: mobileViewport,
    });
    const guestPage = await guestContext.newPage();

    try {
      await hostPage.goto("/games/real-or-ai");
      await waitForRealtimeReady(hostPage);
      await hostPage.locator("#real-ai-create-nickname").fill("short-host");
      await hostPage
        .locator('form:has(#real-ai-create-nickname) button[type="submit"]')
        .click();
      await expect(hostPage.locator("#real-ai-countdown-select")).toBeVisible();

      const roomCode = extractRealOrAiRoomCode(await hostPage.locator("body").innerText());

      await guestPage.goto(`/games/real-or-ai/join?roomCode=${roomCode}`);
      await waitForRealtimeReady(guestPage);
      await guestPage.locator("#real-ai-join-nickname").fill("short-guest");
      await guestPage
        .locator('form:has(#real-ai-join-nickname) button[type="submit"]')
        .click();

      await hostPage.locator("#real-ai-countdown-select").selectOption("3");
      await expect(hostPage.getByTestId("real-ai-start-game")).toBeEnabled();
      await hostPage.getByTestId("real-ai-start-game").click();
      await expect(guestPage.getByTestId("real-ai-candidate-A")).toBeVisible({
        timeout: 6000,
      });

      await expect(guestPage.locator("body")).not.toContainText(roomCode);

      const cardA = guestPage.getByTestId("real-ai-candidate-A");
      const frameABox = await guestPage.getByTestId("real-ai-candidate-A-frame").boundingBox();
      const frameBBox = await guestPage.getByTestId("real-ai-candidate-B-frame").boundingBox();
      const candidateBBox = await guestPage.getByTestId("real-ai-candidate-B").boundingBox();
      const submitBarBox = await guestPage.getByTestId("real-ai-submit-bar").boundingBox();
      const submitButton = guestPage.getByTestId("real-ai-submit-answer");
      const submitButtonBox = await submitButton.boundingBox();
      const magnifierButtonBox = await cardA.locator("button").nth(1).boundingBox();
      const zoomButtonBox = await cardA.locator("button").nth(2).boundingBox();
      const leaveButtonBox = await guestPage.getByTestId("real-ai-leave-round").boundingBox();

      expect(frameABox).not.toBeNull();
      expect(frameBBox).not.toBeNull();
      expect(candidateBBox).not.toBeNull();
      expect(submitBarBox).not.toBeNull();
      expect(submitButtonBox).not.toBeNull();
      expect(magnifierButtonBox).not.toBeNull();
      expect(zoomButtonBox).not.toBeNull();
      expect(leaveButtonBox).not.toBeNull();
      await expect(submitButton).toBeDisabled();
      expect(frameABox!.width).toBeGreaterThanOrEqual(mobileViewport.width - 40);
      expect(frameABox!.height).toBeGreaterThanOrEqual(156);
      expect(candidateBBox!.y).toBeLessThan(mobileViewport.height);
      expect(frameBBox!.y).toBeLessThan(mobileViewport.height);
      expect(submitBarBox!.y + submitBarBox!.height).toBeLessThanOrEqual(
        mobileViewport.height - 12,
      );
      expect(submitButtonBox!.width).toBeGreaterThanOrEqual(96);
      expect(submitButtonBox!.height).toBeGreaterThanOrEqual(44);
      expect(leaveButtonBox!.y).toBeGreaterThanOrEqual(0);
      expect(boxesOverlap(frameABox!, magnifierButtonBox!)).toBe(false);
      expect(boxesOverlap(frameABox!, zoomButtonBox!)).toBe(false);
      expect(boxesOverlap(frameBBox!, submitBarBox!)).toBe(false);
      await expect(guestPage.getByTestId("real-ai-submit-bar")).toContainText(
        "후보 선택 후 제출",
      );

      await guestPage.getByRole("button", { name: "후보 A 선택" }).click();
      await expect(guestPage.getByTestId("real-ai-submit-bar")).toContainText(
        "후보 A 선택 · 제출",
      );
      await expect(submitButton).toBeEnabled();

      await submitButton.click();
      await expect(guestPage.getByTestId("real-ai-submit-bar")).toContainText(
        "제출 완료 · 후보 A",
      );
      await expect(submitButton).toHaveText("제출 완료");
      await expect(submitButton).toBeDisabled();
      const submittedButtonBox = await submitButton.boundingBox();
      expect(submittedButtonBox).not.toBeNull();
      expect(submittedButtonBox!.width).toBeGreaterThanOrEqual(112);
      expect(submittedButtonBox!.height).toBeGreaterThanOrEqual(44);
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()]);
    }
  });

  test("returns scrolled mobile players to the Real or AI round surface when play starts", async ({
    browser,
  }) => {
    const mobileViewport = {
      height: 800,
      width: 360,
    };
    const hostContext = await browser.newContext({
      isMobile: true,
      viewport: mobileViewport,
    });
    const hostPage = await hostContext.newPage();
    const guestContext = await browser.newContext({
      isMobile: true,
      viewport: mobileViewport,
    });
    const guestPage = await guestContext.newPage();

    try {
      await hostPage.goto("/games/real-or-ai");
      await waitForRealtimeReady(hostPage);
      await hostPage.locator("#real-ai-create-nickname").fill("scroll-host");
      await hostPage
        .locator('form:has(#real-ai-create-nickname) button[type="submit"]')
        .click();
      await expect(hostPage.locator("#real-ai-countdown-select")).toBeVisible();

      const roomCode = extractRealOrAiRoomCode(await hostPage.locator("body").innerText());

      await guestPage.goto(`/games/real-or-ai/join?roomCode=${roomCode}`);
      await waitForRealtimeReady(guestPage);
      await guestPage.locator("#real-ai-join-nickname").fill("scroll-guest");
      await guestPage
        .locator('form:has(#real-ai-join-nickname) button[type="submit"]')
        .click();

      await hostPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await guestPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      expect(await hostPage.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect(await guestPage.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      await hostPage.locator("#real-ai-countdown-select").selectOption("3");
      await hostPage.getByTestId("real-ai-start-game").click();
      await Promise.all([
        hostPage.getByTestId("real-ai-candidate-A").waitFor({
          state: "visible",
          timeout: 6000,
        }),
        guestPage.getByTestId("real-ai-candidate-A").waitFor({
          state: "visible",
          timeout: 6000,
        }),
      ]);

      const hostAnchorBox = await hostPage.getByTestId("real-ai-active-round-anchor").boundingBox();
      const guestAnchorBox = await guestPage
        .getByTestId("real-ai-active-round-anchor")
        .boundingBox();
      const guestSubmitBarBox = await guestPage.getByTestId("real-ai-submit-bar").boundingBox();
      expect(hostAnchorBox).not.toBeNull();
      expect(guestAnchorBox).not.toBeNull();
      expect(guestSubmitBarBox).not.toBeNull();
      expect(hostAnchorBox!.y).toBeLessThanOrEqual(16);
      expect(guestAnchorBox!.y).toBeLessThanOrEqual(16);
      expect(guestSubmitBarBox!.y + guestSubmitBarBox!.height).toBeLessThanOrEqual(
        mobileViewport.height,
      );
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()]);
    }
  });


});
