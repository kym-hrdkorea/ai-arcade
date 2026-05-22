import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type JoinedParticipant = {
  context: BrowserContext;
  page: Page;
};

type ElementMetrics = {
  bottom: number;
  height: number;
  inFirstViewport: boolean;
  top: number;
  width: number;
};

type PageMetrics = {
  answerInput: ElementMetrics | null;
  canvas: ElementMetrics | null;
  leaveButton: ElementMetrics | null;
  primaryButton: ElementMetrics | null;
  promptChip: ElementMetrics | null;
  roomCode: ElementMetrics | null;
  scrollHeight: number;
  viewportHeight: number;
  viewportWidth: number;
};

const auditDir = join(process.cwd(), "tmp", "player-ux-audit");

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
    throw new Error("Room code was not rendered after room creation.");
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
): Promise<JoinedParticipant> {
  const context = await browser.newContext({
    isMobile: true,
    viewport: {
      height: 844,
      width: 390,
    },
  });
  const page = await context.newPage();

  await page.goto(`/join/${roomCode}`);
  await waitForRealtimeReady(page);
  await page.locator("#join-nickname").fill(nickname);
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.locator("body")).toContainText(roomCode);

  return {
    context,
    page,
  };
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    fullPage: true,
    path: join(auditDir, `${name}.png`),
  });
}

async function getMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    function metricsFor(element: Element | null): ElementMetrics | null {
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      if (rect.width === 0 && rect.height === 0) {
        return null;
      }

      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        inFirstViewport: rect.top >= 0 && rect.bottom <= viewportHeight,
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    }

    const roomCode = Array.from(document.querySelectorAll("h2, .font-arcade")).find(
      (element) => /[A-Z0-9]{6}/.test(element.textContent ?? ""),
    );
    const primaryButton = Array.from(document.querySelectorAll("button")).find((button) =>
      /입장하기|제출|게임 시작|라운드 스킵/.test(button.textContent ?? ""),
    );
    const answerInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="정답을 입력하세요"]',
    );

    return {
      answerInput: metricsFor(answerInput),
      canvas: metricsFor(document.querySelector('[aria-label="Draw Duel drawing canvas"]')),
      leaveButton: metricsFor(
        Array.from(document.querySelectorAll("button")).find((button) =>
          /나가기/.test(button.textContent ?? ""),
        ) ?? null,
      ),
      primaryButton: metricsFor(primaryButton ?? null),
      promptChip: metricsFor(document.querySelector('[data-testid="draw-duel-prompt-chip"]')),
      roomCode: metricsFor(roomCode ?? null),
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
}

test.describe("Draw Duel player UX audit", () => {
  test("captures mobile and large-screen layout evidence", async ({ browser }) => {
    mkdirSync(auditDir, { recursive: true });

    const host = await createHostRoom(browser);
    const screenContext = await browser.newContext({
      viewport: {
        height: 1080,
        width: 1920,
      },
    });
    const screenPage = await screenContext.newPage();
    const firstGuest = await joinParticipant(browser, host.roomCode, "처음유저");
    const secondGuest = await joinParticipant(browser, host.roomCode, "빠른유저");
    const thirdGuest = await joinParticipant(browser, host.roomCode, "관찰유저");
    const metrics: Record<string, PageMetrics> = {};

    try {
      await screenPage.goto(`/screen/${host.roomCode}`);
      await waitForRealtimeReady(screenPage);
      await expect(screenPage.getByTestId("draw-duel-screen-participants")).toContainText(
        "참가자 4명",
      );

      metrics.mobileWaiting = await getMetrics(firstGuest.page);
      const waitingLobby = firstGuest.page.getByTestId("draw-duel-waiting-lobby");
      await expect(waitingLobby).toBeVisible();
      await expect(firstGuest.page.locator('[aria-label="Draw Duel drawing canvas"]')).toHaveCount(0);
      await expect(waitingLobby.getByRole("button", { name: "나가기" })).toBeVisible();
      await waitingLobby.getByRole("button", { name: "나가기" }).click();
      await expect(firstGuest.page.getByRole("dialog")).toContainText("방에서 나갈까요?");
      await firstGuest.page.getByRole("button", { name: "취소" }).click();
      await expect(waitingLobby).toBeVisible();
      expect(metrics.mobileWaiting.canvas).toBeNull();
      expect(metrics.mobileWaiting.scrollHeight).toBeLessThanOrEqual(
        metrics.mobileWaiting.viewportHeight,
      );
      await capture(firstGuest.page, "mobile-waiting-after-join");
      await capture(screenPage, "screen-waiting");

      await host.page.getByRole("button", { name: "순서대로 교대" }).click();
      await expect(host.page.getByRole("button", { name: "순서대로 교대" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await host.page.getByLabel("라운드 시간").selectOption("90");
      await expect(host.page.getByLabel("라운드 시간")).toHaveValue("90");
      await host.page.getByRole("button", { name: "게임 시작" }).click();
      await expect(firstGuest.page.getByPlaceholder("정답을 입력하세요")).toBeVisible();
      await expect(firstGuest.page.getByText("정답자")).toBeVisible();
      await expect(screenPage.locator("header")).not.toContainText(host.roomCode);
      metrics.mobileGuesserRound = await getMetrics(firstGuest.page);
      await capture(firstGuest.page, "mobile-guesser-round");
      await capture(screenPage, "screen-drawing");

      await firstGuest.page.getByRole("button", { name: "플레이 메뉴" }).click();
      await firstGuest.page.getByRole("button", { name: "나가기" }).click();
      await expect(firstGuest.page.getByRole("dialog")).toContainText("방에서 나갈까요?");
      await firstGuest.page.getByRole("button", { name: "취소" }).click();

      await host.page.getByRole("button", { name: "라운드 스킵" }).click();
      await expect(screenPage.getByTestId("draw-duel-screen-answer")).toContainText(
        /정답 공개|AI 추측 중/,
        { timeout: 10_000 },
      );
      await capture(screenPage, "screen-result");
      await host.page.getByRole("button", { name: "방 리셋" }).click();
      await expect(host.page.getByRole("dialog")).toContainText("방을 리셋할까요?");
      await host.page.getByRole("button", { name: "취소" }).click();

      await host.page.getByRole("button", { name: "다음" }).click();
      await host.page.getByRole("button", { name: "다음" }).click();
      await host.page.getByRole("button", { name: "다음 라운드" }).click();
      await expect(firstGuest.page.getByText("이번 라운드의 출제자입니다.")).toBeVisible();
      await expect(firstGuest.page.getByTestId("draw-duel-prompt-chip")).toBeVisible();
      await firstGuest.page.getByRole("button", { name: "전체 지우기" }).click();
      await expect(firstGuest.page.getByRole("dialog")).toContainText("현재 그림을 모두 지울까요?");
      await firstGuest.page.getByRole("button", { name: "취소" }).click();
      metrics.mobileDrawerRound = await getMetrics(firstGuest.page);
      await capture(firstGuest.page, "mobile-drawer-round");

      writeFileSync(
        join(auditDir, "metrics.json"),
        JSON.stringify(metrics, null, 2),
        "utf8",
      );

      expect(metrics.mobileGuesserRound.canvas?.inFirstViewport).toBe(true);
      expect(metrics.mobileGuesserRound.answerInput?.inFirstViewport).toBe(true);
      expect(metrics.mobileDrawerRound.promptChip?.inFirstViewport).toBe(true);
      expect(metrics.mobileDrawerRound.canvas?.inFirstViewport).toBe(true);
    } finally {
      await Promise.all([
        host.context.close(),
        screenContext.close(),
        firstGuest.context.close(),
        secondGuest.context.close(),
        thirdGuest.context.close(),
      ]);
    }
  });
});
