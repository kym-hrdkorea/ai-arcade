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

    const firstStart = page.getByRole("link", { name: "시작" }).first();
    await expect(firstStart).toBeInViewport();

    await page.getByRole("button", { name: "도움말" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("QR 입장");
    await expect(dialog).not.toContainText("Phase 2");
    await page.getByLabel("도움말 닫기").click();
    await expect(dialog).toHaveCount(0);
  });

  test("opens and navigates game card guide slides from the hub", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Draw Duel 사용설명 열기" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("방 만들기와 참가");
    await expect(dialog).toContainText("1/5");
    await expect(dialog.getByRole("button", { name: "이전" })).toBeDisabled();

    await dialog.getByRole("button", { name: "다음" }).click();
    await expect(dialog).toContainText("출제자는 그림 그리기");
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

    await page.getByRole("button", { name: "Three Word Monster 사용설명 열기" }).click();
    const monsterDialog = page.getByRole("dialog");
    await expect(monsterDialog).toContainText("Three Word Monster");
    await page.keyboard.press("Escape");
    await expect(monsterDialog).toHaveCount(0);
  });

  test("routes hub quick join to the selected Three Word Monster join page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("게임").selectOption("three-word-monster");
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
