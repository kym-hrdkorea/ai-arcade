import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type PlayerPages = {
  guestContext: BrowserContext;
  guestPage: Page;
  hostContext: BrowserContext;
  hostPage: Page;
  roomCode: string;
};

async function waitForRealtimeReady(page: Page) {
  await expect(page.getByText("서버 연결됨")).toBeVisible();
}

async function createHostRoom(browser: Browser, nickname: string) {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();

  await hostPage.goto("/host");
  await waitForRealtimeReady(hostPage);
  await hostPage.locator("#create-nickname").fill(nickname);
  await hostPage.getByRole("button", { name: "방 만들기" }).click();
  await expect(hostPage.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

  const bodyText = await hostPage.locator("body").innerText();
  const roomCode = bodyText.match(/방 코드\s*([A-Z0-9]{6})/)?.[1];

  if (!roomCode) {
    throw new Error("Room code was not rendered after room creation.");
  }

  return {
    hostContext,
    hostPage,
    roomCode,
  };
}

async function createJoinedRoom(
  browser: Browser,
  hostNickname: string,
  guestNickname: string,
): Promise<PlayerPages> {
  const host = await createHostRoom(browser, hostNickname);
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();

  await guestPage.goto(`/join/${host.roomCode}`);
  await waitForRealtimeReady(guestPage);
  await expect(guestPage.locator("#join-room-code")).toHaveCount(0);
  await expect(guestPage.locator("body")).toContainText(host.roomCode);
  await expect(guestPage.locator("body")).not.toContainText("방 만들기");
  await guestPage.locator("#join-nickname").fill(guestNickname);
  await guestPage.getByRole("button", { name: "입장하기" }).click();
  await expect(guestPage.locator("body")).toContainText(host.roomCode);
  await expect(host.hostPage.getByRole("button", { name: "게임 시작" })).toBeEnabled();

  return {
    ...host,
    guestContext,
    guestPage,
  };
}

async function closeJoinedRoom(room: PlayerPages) {
  await Promise.all([room.hostContext.close(), room.guestContext.close()]);
}

async function setMaxRounds(page: Page, rounds: number) {
  const settingsPanel = page.locator("body");

  for (let current = 5; current > rounds; current -= 1) {
    await page.getByLabel("라운드 줄이기").click();
    await expect(settingsPanel).toContainText(
      new RegExp(`최대 라운드\\s*${current - 1}\\s*라운드`),
    );
  }
}

async function setRoundDuration(page: Page, seconds: "30" | "45" | "60" | "90") {
  await page.getByLabel("라운드 시간").selectOption(seconds);
  await expect(page.getByLabel("라운드 시간")).toHaveValue(seconds);
}

test.describe("Draw Duel pilot readiness", () => {
  test("routes hub quick join to a nickname-only join page", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
    await page.goto("/");
    await page.locator("#room-code").fill("abc123");
    const quickJoinButton = page.getByRole("button", { name: "바로 참가" });
    await expect(quickJoinButton).toBeEnabled();
    await quickJoinButton.click();

    await expect(page).toHaveURL(/\/join\/ABC123/);
    await waitForRealtimeReady(page);
    await expect(page.locator("body")).toContainText("ABC123");
    await expect(page.locator("#join-room-code")).toHaveCount(0);
    await expect(page.locator("#join-nickname")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("방 만들기");
    } finally {
      await context.close();
    }
  });

  test("covers host-only setup, QR, guest read-only settings, rejoin, scoring, and final result", async ({
    browser,
  }) => {
    const room = await createJoinedRoom(browser, "host-pilot", "guest-pilot");

    try {
      await expect(room.hostPage.getByRole("button", { name: /QR 입장/ })).toBeVisible();
      await expect(room.guestPage.getByRole("button", { name: /QR 입장/ })).toHaveCount(0);
      await expect(room.guestPage.getByText("호스트가 시작 전 설정을 조정합니다.")).toBeVisible();
      await expect(room.guestPage.getByRole("button", { name: "순서대로 교대" })).toHaveCount(0);

      await expect(room.hostPage.getByText("참가 링크")).toHaveCount(0);
      await room.hostPage.getByRole("button", { name: /QR 입장/ }).click();
      await expect(room.hostPage.getByText("참가 링크")).toBeVisible();
      await expect(room.hostPage.getByText(`/join/${room.roomCode}`)).toBeVisible();
      await expect(room.hostPage.getByText(`/screen/${room.roomCode}`)).toBeVisible();
      await room.hostPage.getByRole("button", { name: "크게 보기" }).click();
      await expect(room.hostPage.getByRole("dialog")).toContainText(room.roomCode);
      await room.hostPage.getByLabel("QR 모달 닫기").click();
      await expect(room.hostPage.getByRole("dialog")).toHaveCount(0);

      await setMaxRounds(room.hostPage, 1);
      await setRoundDuration(room.hostPage, "90");
      await room.hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(room.hostPage.locator("body")).toContainText("이번 라운드의 출제자입니다.");
      await expect(room.guestPage.locator("body")).toContainText("host-pilot가 그리고 있습니다.");
      await expect(room.hostPage.locator("body")).toContainText("1/1");
      await expect(room.hostPage.locator("body")).toContainText(/(89|90)초/);
      const answer = (await room.hostPage.getByTestId("draw-duel-word").innerText()).trim();

      await room.guestPage.reload();
      await expect(room.guestPage.locator("body")).toContainText("host-pilot가 그리고 있습니다.");
      await expect(room.guestPage.locator("body")).toContainText("방에 다시 연결됐습니다.");

      await room.guestPage.getByPlaceholder("정답을 입력하세요").fill(answer);
      await room.guestPage.getByRole("button", { name: "제출" }).click();
      await expect(room.hostPage.locator("body")).toContainText("AI가 정답을 추측하고 있습니다");
      await expect(room.hostPage.getByTestId("draw-duel-ai-thinking")).toContainText(
        "AI가 그림의 큰 형태를 먼저 살펴보고 있어요.",
      );
      await expect(room.hostPage.locator("body")).not.toContainText("AI의 답", { timeout: 1000 });
      await expect(room.hostPage.locator("body")).toContainText("AI의 답", { timeout: 8000 });
      await expect(room.hostPage.getByTestId("draw-duel-ai-thinking")).toHaveCount(0);
      await expect(room.hostPage.locator("body")).toContainText(answer);
      await room.hostPage.getByRole("button", { name: "다음" }).click();
      await expect(room.guestPage.locator("body")).toContainText(/AI WIN|HUMAN WIN|DRAW/);
      await room.hostPage.getByRole("button", { name: "다음" }).click();
      await expect(room.guestPage.locator("body")).toContainText("참가자 답변");
      await expect(room.guestPage.locator("body")).toContainText("guest-pilot");
      await room.hostPage.getByRole("button", { name: "최종 결과 보기" }).click();
      const finalResult = room.hostPage.getByTestId("draw-duel-final-result");
      await expect(finalResult).toContainText(/AI WIN|HUMAN WIN|DRAW/);
      await expect(finalResult).toContainText("정답 랭킹");
      await expect(finalResult).toContainText("guest-pilot");
      await expect(finalResult).toContainText("1개");
      await expect(room.hostPage.locator("body")).not.toContainText("실시간 드로잉");
      await expect(room.hostPage.locator("body")).not.toContainText("AI가 정답을 추측하고 있습니다");
      await expect(room.hostPage.locator("body")).not.toContainText("라운드");
      await expect(room.hostPage.getByLabel("Draw Duel drawing canvas")).toHaveCount(0);
    } finally {
      await closeJoinedRoom(room);
    }
  });

  test("rotates the drawer only when rotate mode is selected and preserves settings after reset", async ({
    browser,
  }) => {
    const room = await createJoinedRoom(browser, "host-rotate", "guest-rotate");

    try {
      await room.hostPage.getByRole("button", { name: "순서대로 교대" }).click();
      await expect(room.hostPage.getByRole("button", { name: "순서대로 교대" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await room.hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(room.hostPage.locator("body")).toContainText("이번 라운드의 출제자입니다.");
      await room.hostPage.getByRole("button", { name: "라운드 스킵" }).click();
      await expect(room.hostPage.locator("body")).toContainText("AI가 정답을 추측하고 있습니다");
      await expect(room.hostPage.locator("body")).toContainText("호스트가 라운드를 스킵했습니다.", {
        timeout: 8000,
      });
      await room.hostPage.getByRole("button", { name: "다음" }).click();
      await room.hostPage.getByRole("button", { name: "다음" }).click();
      await room.hostPage.getByRole("button", { name: "다음 라운드" }).click();
      await expect(room.guestPage.locator("body")).toContainText("이번 라운드의 출제자입니다.");
      await expect(room.hostPage.locator("body")).toContainText("guest-rotate가 그리고 있습니다.");

      await room.hostPage.getByRole("button", { name: "방 리셋" }).click();
      await expect(room.hostPage.getByRole("dialog")).toContainText("방을 리셋할까요?");
      await room.hostPage.getByRole("button", { exact: true, name: "리셋" }).click();
      await expect(room.hostPage.locator("body")).toContainText("게임 설정");
      await expect(room.hostPage.getByRole("button", { name: "순서대로 교대" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await closeJoinedRoom(room);
    }
  });

  test("keeps the drawing board visible near the top on desktop", async ({ browser }) => {
    const room = await createJoinedRoom(browser, "host-layout", "guest-layout");

    try {
      await room.hostPage.setViewportSize({ height: 900, width: 1440 });
      await room.hostPage.getByRole("button", { name: "게임 시작" }).click();
      const canvas = room.hostPage.getByLabel("Draw Duel drawing canvas");
      await expect(canvas).toBeInViewport();

      const box = await canvas.boundingBox();

      expect(box).not.toBeNull();
      expect(box?.y).toBeLessThan(520);
      expect(box?.width).toBeGreaterThan(560);
    } finally {
      await closeJoinedRoom(room);
    }
  });

  test("keeps the mobile guesser board and answer input in the first viewport", async ({
    browser,
  }) => {
    const host = await createHostRoom(browser, "host-mplay");
    const guestContext = await browser.newContext({
      isMobile: true,
      viewport: {
        height: 844,
        width: 390,
      },
    });
    const guestPage = await guestContext.newPage();

    try {
      await guestPage.goto(`/play/${host.roomCode}`);
      await waitForRealtimeReady(guestPage);
      await guestPage.locator("#join-nickname").fill("guest-mobile-play");
      await guestPage.getByRole("button", { name: "입장하기" }).click();
      await expect(host.hostPage.getByRole("button", { name: "게임 시작" })).toBeEnabled();

      await host.hostPage.getByRole("button", { name: "게임 시작" }).click();
      await expect(guestPage.locator("body")).toContainText("host-mplay가 그리고 있습니다.");

      const canvas = guestPage.getByLabel("Draw Duel drawing canvas");
      const answerInput = guestPage.getByPlaceholder("정답을 입력하세요");
      await expect(canvas).toBeInViewport();
      await expect(answerInput).toBeInViewport();

      const canvasBox = await canvas.boundingBox();
      const inputBox = await answerInput.boundingBox();

      expect(canvasBox).not.toBeNull();
      expect(inputBox).not.toBeNull();
      expect((inputBox?.y ?? 9999) + (inputBox?.height ?? 0)).toBeLessThanOrEqual(844);
    } finally {
      await Promise.all([host.hostContext.close(), guestContext.close()]);
    }
  });

  test("shows the expanded drawing color palette to the active drawer", async ({ browser }) => {
    const room = await createJoinedRoom(browser, "host-colors", "guest-colors");

    try {
      await room.hostPage.getByRole("button", { name: "게임 시작" }).click();

      const colors = room.hostPage.locator("[aria-label='하늘색'], [aria-label='노랑'], [aria-label='빨강'], [aria-label='초록'], [aria-label='검정'], [aria-label='파랑'], [aria-label='보라'], [aria-label='분홍'], [aria-label='주황']");
      await expect(colors).toHaveCount(9);
      await room.hostPage.getByLabel("주황").click();
      await expect(room.hostPage.getByLabel("주황")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await closeJoinedRoom(room);
    }
  });

  test("renders the expanded QR modal inside a mobile viewport", async ({ browser }) => {
    const hostContext = await browser.newContext({
      isMobile: true,
      viewport: {
        height: 844,
        width: 390,
      },
    });
    const hostPage = await hostContext.newPage();

    try {
      await hostPage.goto("/host");
      await waitForRealtimeReady(hostPage);
      await hostPage.locator("#create-nickname").fill("host-mobile");
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
    } finally {
      await hostContext.close();
    }
  });
});
