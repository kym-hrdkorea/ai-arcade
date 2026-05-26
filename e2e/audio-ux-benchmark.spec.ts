import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ video: "off" });

type AudioDebugEvent =
  | {
      atMs: number;
      scene: string;
      type: "scene";
    }
  | {
      atMs: number;
      muted: boolean;
      type: "mute";
    }
  | {
      atMs: number;
      type: "unlock";
      unlocked: boolean;
    }
  | {
      atMs: number;
      cue: string;
      delayMs: number;
      key?: string;
      played: boolean;
      reason: string;
      scene: string;
      type: "cue";
    };

async function readAudioEvents(page: Page) {
  return page.evaluate(() => {
    const audioWindow = window as Window & {
      __AI_ARCADE_AUDIO_EVENTS__?: AudioDebugEvent[];
    };

    return audioWindow.__AI_ARCADE_AUDIO_EVENTS__ ?? [];
  });
}

function extractRoomCode(text: string) {
  const roomCode = text.match(/방 코드\s*([A-Z0-9]{6})/)?.[1];

  if (!roomCode) {
    throw new Error("Room code was not rendered.");
  }

  return roomCode;
}

async function createRealOrAiRoom(browser: Browser) {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();

  await hostPage.goto("/games/real-or-ai");
  await expect(hostPage.getByText("서버 연결됨")).toBeVisible();
  await hostPage.getByRole("button", { name: "소리 켜기" }).click();
  await hostPage.locator("#real-ai-create-nickname").fill("audio-host");
  await hostPage.getByRole("button", { name: "방 만들기" }).click();
  await expect(hostPage.locator("body")).toContainText(/방 코드\s*[A-Z0-9]{6}/);

  const roomCode = extractRoomCode(await hostPage.locator("body").innerText());

  return {
    hostContext,
    hostPage,
    roomCode,
  };
}

test.describe("audio UX benchmark", () => {
  test("plays the first UI cue when a normal game control unlocks audio", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "다음 게임" }).click();

    await expect
      .poll(async () => {
        const events = await readAudioEvents(page);

        return events.some(
          (event) => event.type === "cue" && event.cue === "ui_select" && event.played,
        );
      })
      .toBe(true);

    const events = await readAudioEvents(page);
    const uiSelectEvents = events.filter(
      (event) => event.type === "cue" && event.cue === "ui_select",
    );

    expect(uiSelectEvents.some((event) => event.played)).toBe(true);
    expect(uiSelectEvents.some((event) => event.reason === "locked")).toBe(false);
  });

  test("unlocks on first audio click and plays hub cues without locked bursts", async ({
    page,
  }) => {
    await page.goto("/");

    const audioButton = page.getByRole("button", { name: "소리 켜기" });
    await expect(audioButton).toHaveAttribute("aria-pressed", "false");

    await audioButton.click();
    await expect(page.getByRole("button", { name: "소리 끄기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "다음 게임" }).click();
    await page.getByRole("button", { name: "이전 게임" }).click();
    await page.getByRole("button", { name: "안내" }).click();
    await page.getByLabel("안내 닫기").click();

    const events = await readAudioEvents(page);
    const cueEvents = events.filter((event) => event.type === "cue");
    const unlockEvents = events.filter((event) => event.type === "unlock");

    expect(unlockEvents.some((event) => event.unlocked)).toBe(true);
    expect(
      cueEvents.some((event) => event.played && event.cue === "ui_confirm"),
    ).toBe(true);
    expect(
      cueEvents.some((event) => event.played && event.reason !== "played"),
    ).toBe(false);
    expect(
      cueEvents.some((event) => !event.played && event.reason === "locked"),
    ).toBe(false);
  });

  test("keeps BGM in lobby only and mutes it when Real or AI starts", async ({
    browser,
  }) => {
    const host = await createRealOrAiRoom(browser);
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    try {
      await guestPage.goto(`/games/real-or-ai/join?roomCode=${host.roomCode}`);
      await expect(guestPage.getByText("서버 연결됨")).toBeVisible();
      await guestPage.locator("#real-ai-join-nickname").fill("audio-guest");
      await guestPage.getByRole("button", { name: "입장하기" }).click();
      await expect(host.hostPage.getByTestId("real-ai-start-game")).toBeEnabled();

      await host.hostPage.getByTestId("real-ai-start-game").click();
      await expect
        .poll(async () => {
          const events = await readAudioEvents(host.hostPage);

          return events.some((event) => event.type === "scene" && event.scene === "muted");
        })
        .toBe(true);

      const sceneEvents = (await readAudioEvents(host.hostPage)).filter(
        (event) => event.type === "scene",
      );

      expect(sceneEvents.some((event) => event.scene === "lobby")).toBe(true);
      expect(sceneEvents.at(-1)).toMatchObject({
        scene: "muted",
        type: "scene",
      });
    } finally {
      await guestContext.close();
      await host.hostContext.close();
    }
  });
});
