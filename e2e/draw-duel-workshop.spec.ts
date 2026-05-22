import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type JoinedParticipant = {
  context: BrowserContext;
  page: Page;
};

async function waitForRealtimeReady(page: Page) {
  await expect(page.getByText("서버 연결됨")).toBeVisible();
}

async function createHostRoom(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/host");
  await waitForRealtimeReady(page);
  await page.locator("#create-nickname").fill("워크숍진행");
  await page.getByRole("button", { name: "방 만들기" }).click();
  await expect(page.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

  const bodyText = await page.locator("body").innerText();
  const roomCode = bodyText.match(/방 코드\s*([A-Z0-9]{6})/)?.[1];

  if (!roomCode) {
    throw new Error("Room code was not visible after host room creation.");
  }

  return {
    context,
    page,
    roomCode,
  };
}

async function joinParticipant(
  browser: Browser,
  roomCode: string,
  nickname: string,
  route: "join" | "play" = "join",
): Promise<JoinedParticipant> {
  const context = await browser.newContext({
    isMobile: true,
    viewport: {
      height: 844,
      width: 390,
    },
  });
  const page = await context.newPage();

  await page.goto(`/${route}/${roomCode}`);
  await waitForRealtimeReady(page);
  await expect(page.locator("body")).toContainText(roomCode);
  await page.locator("#join-nickname").fill(nickname);
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.locator("body")).toContainText(roomCode);

  return {
    context,
    page,
  };
}

test.describe("Draw Duel workshop rehearsal routes", () => {
  test("runs host, join, play, screen, and admin rehearsal flow", async ({ browser }) => {
    const host = await createHostRoom(browser);
    const screenContext = await browser.newContext({
      viewport: {
        height: 1080,
        width: 1920,
      },
    });
    const screenPage = await screenContext.newPage();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const wrongCodeContext = await browser.newContext();
    const wrongCodePage = await wrongCodeContext.newPage();
    const delayedContext = await browser.newContext();
    const delayedPage = await delayedContext.newPage();
    const joinedParticipants: JoinedParticipant[] = [];

    try {
      await host.page.getByRole("button", { name: /QR 입장/ }).click();
      await expect(host.page.getByText(`/join/${host.roomCode}`)).toBeVisible();
      await expect(host.page.getByText(`/screen/${host.roomCode}`)).toBeVisible();

      await screenPage.goto(`/screen/${host.roomCode}`);
      await waitForRealtimeReady(screenPage);
      await expect(screenPage.getByTestId("draw-duel-screen-round")).toContainText("대기");
      await expect(screenPage.getByText("휴대폰으로 QR을 찍거나 방 코드를 입력하세요")).toBeVisible();

      await adminPage.goto(`/admin/${host.roomCode}`);
      await waitForRealtimeReady(adminPage);
      await expect(adminPage.getByRole("link", { name: "진행자 콘솔" })).toBeVisible();
      await expect(adminPage.getByRole("link", { name: "대형 스크린" })).toHaveAttribute(
        "href",
        `/screen/${host.roomCode}`,
      );

      joinedParticipants.push(
        await joinParticipant(browser, host.roomCode, "참가자하나", "join"),
      );
      joinedParticipants.push(
        await joinParticipant(browser, host.roomCode, "참가자둘", "play"),
      );
      joinedParticipants.push(
        await joinParticipant(browser, host.roomCode, "참가자하나", "join"),
      );

      await expect(joinedParticipants[2].page.locator("body")).toContainText(
        /같은 닉네임이 있어 .+으로 표시됩니다\./,
      );
      await expect(screenPage.getByTestId("draw-duel-screen-participants")).toContainText(
        "참가자 4명",
      );
      await expect(screenPage.getByTestId("draw-duel-screen-participants")).toContainText(
        "워크숍진행",
      );
      await expect(screenPage.getByTestId("draw-duel-screen-participants")).toContainText(
        "참가자둘",
      );

      await host.page.getByLabel("라운드 시간").selectOption("90");
      await expect(host.page.getByLabel("라운드 시간")).toHaveValue("90");
      await expect(host.page.getByRole("button", { name: "게임 시작" })).toBeEnabled();
      await host.page.getByRole("button", { name: "게임 시작" }).click();
      await expect(screenPage.getByTestId("draw-duel-screen-round")).toContainText("1/5");
      await expect(screenPage.getByTestId("draw-duel-screen-answer")).toContainText("정답 비공개");
      await expect(screenPage.getByTestId("draw-duel-screen-score")).toContainText("AI Guesser");
      await expect(screenPage.getByTestId("draw-duel-screen-score")).toContainText("워크숍진행");
      const answer = (await host.page.getByTestId("draw-duel-word").innerText()).trim();

      await screenPage.reload();
      await waitForRealtimeReady(screenPage);
      await expect(screenPage.getByTestId("draw-duel-screen-round")).toContainText("1/5");
      await expect(screenPage.getByTestId("draw-duel-screen-answer")).toContainText("정답 비공개");

      await joinedParticipants[0].page.reload();
      await expect(joinedParticipants[0].page.locator("body")).toContainText(
        "방에 다시 연결됐습니다.",
      );
      await expect(joinedParticipants[0].page.locator("body")).toContainText(
        "워크숍진행가 그리고 있습니다.",
      );

      for (const participant of joinedParticipants) {
        await participant.page.getByPlaceholder("정답을 입력하세요").fill(answer);
        await participant.page.getByRole("button", { name: "제출" }).click();
      }

      await expect(screenPage.getByTestId("draw-duel-screen-answer")).toContainText(
        `정답 공개: ${answer}`,
        { timeout: 10_000 },
      );
      await expect(screenPage.getByTestId("draw-duel-screen-score")).toContainText("100");

      await wrongCodePage.goto("/join/ZZ9999");
      await waitForRealtimeReady(wrongCodePage);
      await wrongCodePage.locator("#join-nickname").fill("없는방");
      await wrongCodePage.getByRole("button", { name: "입장하기" }).click();
      await expect(wrongCodePage.locator("body")).toContainText("방을 찾을 수 없어요.");

      await delayedPage.route(/\/socket\.io\//, async (route) => {
        await route.abort();
      });
      await delayedPage.goto(`/screen/${host.roomCode}`);
      await expect(delayedPage.locator("body")).toContainText(
        "네트워크가 느리면 몇 초 정도 걸릴 수 있습니다.",
      );
      await expect(delayedPage.locator("body")).toContainText(
        "서버 연결이 지연되고 있어요.",
      );
    } finally {
      await Promise.all([
        host.context.close(),
        screenContext.close(),
        adminContext.close(),
        wrongCodeContext.close(),
        delayedContext.close(),
        ...joinedParticipants.map((participant) => participant.context.close()),
      ]);
    }
  });
});
