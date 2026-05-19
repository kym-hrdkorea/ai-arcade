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

async function createMonsterHostRoom(browser: Browser, nickname = "monster-host") {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();

  await hostPage.goto("/games/three-word-monster");
  await waitForRealtimeReady(hostPage);
  await hostPage.locator("#monster-create-nickname").fill(nickname);
  await hostPage.getByRole("button", { name: "방 만들기" }).click();
  await expect(hostPage.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

  const roomCode = extractRoomCode(await hostPage.locator("body").innerText());

  return {
    hostContext,
    hostPage,
    roomCode,
  };
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

async function submitMonsterWords(page: Page, words: [string, string, string]) {
  await page.locator("#monster-word-0").fill(words[0]);
  await page.locator("#monster-word-1").fill(words[1]);
  await page.locator("#monster-word-2").fill(words[2]);
  await page.getByRole("button", { name: "단어 제출" }).click();
}

async function expectNoRawMonsterStatus(page: Page) {
  const bodyText = await page.locator("body").innerText();

  for (const rawStatus of [
    "waiting",
    "word-submission",
    "image-generating",
    "voting",
    "revealing",
    "result",
  ]) {
    expect(bodyText).not.toContain(rawStatus);
  }
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
    await expect(page.getByText("플레이할 게임을 고르세요")).toBeVisible();
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

    await page.getByRole("button", { name: "도움말" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("QR 입장");
    await expect(dialog).not.toContainText("Phase 2");
    await page.getByLabel("도움말 닫기").click();
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
      await expect(screen).toBeVisible();

      const firstBox = await screen.boundingBox();
      if (!firstBox) {
        throw new Error("Hub game screen was not measurable.");
      }

      const expectedSize = {
        height: Math.round(firstBox.height),
        width: Math.round(firstBox.width),
      };

      for (let count = 0; count < 2; count += 1) {
        await page.getByRole("button", { name: "다음 게임" }).click();
        const nextBox = await screen.boundingBox();
        if (!nextBox) {
          throw new Error("Hub game screen disappeared while cycling games.");
        }

        expect(Math.round(nextBox.width)).toBe(expectedSize.width);
        expect(Math.round(nextBox.height)).toBe(expectedSize.height);
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
    await expect(dialog).toContainText("그리는 사람과 맞히는 사람");
    await expect(dialog).toContainText("2/5");

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
    await expect(page.getByRole("heading", { name: "Three Word Monster" })).toBeVisible();
    await page.getByRole("button", { name: "Three Word Monster 사용설명 열기" }).click();
    const monsterDialog = page.getByRole("dialog");
    await expect(monsterDialog).toContainText("Three Word Monster");
    await expect(monsterDialog).not.toContainText("mock 이미지 provider");
    await page.keyboard.press("Escape");
    await expect(monsterDialog).toHaveCount(0);

    await page.getByRole("button", { name: "다음 게임" }).click();
    await expect(page.getByRole("heading", { name: "Real or AI" })).toBeVisible();
    await page.getByRole("button", { name: "Real or AI 사용설명 열기" }).click();
    const realOrAiDialog = page.getByRole("dialog");
    await expect(realOrAiDialog).toContainText("Real or AI");
    await expect(realOrAiDialog).toContainText("방 만들기와 설정");
    await expect(realOrAiDialog).toContainText("5/10/15/30/45/60초");
    await expect(realOrAiDialog).toContainText("권장 45초");
    await realOrAiDialog.getByRole("button", { name: "다음" }).click();
    await expect(realOrAiDialog).toContainText("진짜 사진 고르기");
    await page.keyboard.press("Escape");
    await expect(realOrAiDialog).toHaveCount(0);
  });

  test("exposes Real or AI as a testable selector item with a live join form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Draw Duel" })).toBeVisible();
    await page.getByRole("button", { name: "다음 게임" }).click();
    await expect(page.getByRole("heading", { name: "Three Word Monster" })).toBeVisible();
    await page.getByRole("button", { name: "다음 게임" }).click();
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
      await expect(host.hostPage.getByRole("button", { name: "45초" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await host.hostPage.getByRole("button", { name: "60초" }).click();
      await expect(guestPage.locator("body")).toContainText(/60\s*초 제한/);

      for (let count = 0; count < 9; count += 1) {
        await host.hostPage.getByLabel("라운드 줄이기").click();
      }
      await expect(host.hostPage.locator("body")).toContainText(/1\s*라운드/);
      await host.hostPage.getByRole("button", { name: "5초" }).first().click();
      await host.hostPage.getByRole("button", { name: "3초" }).click();
      await expect(guestPage.locator("body")).toContainText(/1\s*라운드/);
      await expect(guestPage.locator("body")).toContainText(/5\s*초 제한/);
      await expect(guestPage.locator("body")).toContainText(/3\s*초 준비/);

      await host.hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(host.hostPage.getByText("카운트다운").first()).toBeVisible();
      await expect(guestPage.getByText("카운트다운").first()).toBeVisible();
      await expect(host.hostPage.getByText("진행 중").first()).toBeVisible({ timeout: 6000 });

      await expect(guestPage.getByAltText("후보 A 사진").first()).toBeVisible();
      await expect(guestPage.getByAltText("후보 B 사진").first()).toBeVisible();
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
      await guestPage.getByRole("button", { name: "진짜 사진으로 제출" }).click();
      await expect(guestPage.getByText("제출 완료")).toBeVisible();
      await expect(host.hostPage.locator("body")).toContainText(/1\/2|1\s*\/\s*2/);

      await host.hostPage.getByRole("button", { name: "후보 B 선택" }).click();
      await host.hostPage.getByRole("button", { name: "진짜 사진으로 제출" }).click();
      await expect(host.hostPage.getByText("라운드 1 / 1")).toBeVisible({ timeout: 6000 });
      await expect(host.hostPage.getByText("최고 득점")).toBeVisible();
      await expect(host.hostPage.getByText("정답").first()).toBeVisible();
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

  test("keeps the Real or AI magnifier modal inside a mobile viewport", async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({
      isMobile: true,
      viewport: {
        height: 844,
        width: 390,
      },
    });
    const hostPage = await hostContext.newPage();
    const guestContext = await browser.newContext();
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
      await hostPage.getByRole("button", { name: "3초" }).click();
      await hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(hostPage.getByText("진행 중").first()).toBeVisible({ timeout: 6000 });

      await hostPage.getByRole("button", { name: "후보 A 확대 보기" }).click();
      const dialog = hostPage.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("후보 A 확대 보기");

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect(box?.width).toBeLessThanOrEqual(390);

      await hostPage.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()]);
    }
  });

  test("routes hub quick join to the selected Three Word Monster join page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("게임", { exact: true }).selectOption("three-word-monster");
    await page.locator("#room-code").fill("abc123");

    const quickJoinButton = page.getByRole("button", { name: "바로 참가" });
    await expect(quickJoinButton).toBeEnabled();
    await quickJoinButton.click();

    await expect(page).toHaveURL(/\/games\/three-word-monster\/join\?roomCode=ABC123/);
    await waitForRealtimeReady(page);
    await expect(page.locator("#monster-room-code")).toHaveCount(0);
    await expect(page.locator("body")).toContainText("ABC123");
    await expect(page.locator("#monster-join-nickname")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("방 만들기");
  });

  test("plays through Three Word Monster with Korean status labels and result reset", async ({
    browser,
  }) => {
    const host = await createMonsterHostRoom(browser);
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    try {
      await expect(host.hostPage.getByRole("button", { name: /QR 입장/ })).toBeVisible();
      await host.hostPage.getByRole("button", { name: /QR 입장/ }).click();
      await expect(host.hostPage.getByText("참가 링크")).toBeVisible();
      await expect(host.hostPage.getByText("/games/three-word-monster/join?roomCode=")).toBeVisible();
      await expect(host.hostPage.getByText(`roomCode=${host.roomCode}`)).toBeVisible();
      await host.hostPage.getByRole("button", { name: "크게 보기" }).click();
      await expect(host.hostPage.getByRole("dialog")).toContainText(host.roomCode);
      await host.hostPage.keyboard.press("Escape");
      await expect(host.hostPage.getByRole("dialog")).toHaveCount(0);

      await guestPage.goto(`/games/three-word-monster/join?roomCode=${host.roomCode}`);
      await waitForRealtimeReady(guestPage);
      await expect(guestPage.locator("#monster-room-code")).toHaveCount(0);
      await expect(guestPage.locator("body")).toContainText(host.roomCode);
      await expect(guestPage.locator("body")).not.toContainText("방 만들기");
      await guestPage.locator("#monster-join-nickname").fill("monster-guest");
      await guestPage.getByRole("button", { name: "입장하기" }).click();
      await expect(host.hostPage.getByRole("button", { name: "게임 시작" })).toBeEnabled();

      await expectNoRawMonsterStatus(host.hostPage);
      await host.hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(host.hostPage.getByText("3단어 입력")).toBeVisible();
      await expect(guestPage.getByText("3단어 입력")).toBeVisible();

      await submitMonsterWords(host.hostPage, ["용", "우산", "로봇"]);
      await submitMonsterWords(guestPage, ["별", "버튼", "구름"]);
      await expect(host.hostPage.getByRole("heading", { name: "괴물 갤러리" })).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.getByRole("heading", { name: "괴물 갤러리" })).toBeVisible({ timeout: 10_000 });

      await expectNoRawMonsterStatus(host.hostPage);
      await expect(host.hostPage.getByText("자기 괴물에는 투표할 수 없습니다.")).toBeVisible();
      await host.hostPage.getByRole("button", { name: "투표", exact: true }).click();
      await expect(host.hostPage.getByText("내 투표 완료")).toBeVisible();
      await guestPage.getByRole("button", { name: "투표", exact: true }).click();

      await expect(host.hostPage.getByText("결과 발표").first()).toBeVisible({ timeout: 10_000 });
      await expect(host.hostPage.locator("body")).toContainText("우승");
      await expectNoRawMonsterStatus(host.hostPage);

      await host.hostPage.getByRole("button", { name: "다시 시작" }).click();
      await expect(host.hostPage.getByText("대기실")).toBeVisible();
      await expect(host.hostPage.getByText("대기 중")).toBeVisible();
      await expectNoRawMonsterStatus(host.hostPage);
    } finally {
      await Promise.all([host.hostContext.close(), guestContext.close()]);
    }
  });

  test("keeps the Three Word Monster QR modal inside a mobile viewport", async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({
      isMobile: true,
      viewport: {
        height: 844,
        width: 390,
      },
    });
    const hostPage = await hostContext.newPage();

    try {
      await hostPage.goto("/games/three-word-monster");
      await waitForRealtimeReady(hostPage);
      await hostPage.locator("#monster-create-nickname").fill("mobile-host");
      await hostPage.getByRole("button", { name: "방 만들기" }).click();
      await expect(hostPage.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

      await hostPage.getByRole("button", { name: /QR 입장/ }).click();
      await hostPage.getByRole("button", { name: "크게 보기" }).click();

      const dialog = hostPage.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("방 코드");

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect(box?.width).toBeLessThanOrEqual(390);

      await hostPage.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    } finally {
      await hostContext.close();
    }
  });
});
