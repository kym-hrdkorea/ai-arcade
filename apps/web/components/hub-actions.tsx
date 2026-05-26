"use client";

import type { GameModuleMeta } from "@ai-arcade/shared";
import { HelpCircle, Keyboard, QrCode, Smartphone, Ticket, Users, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useGameAudio } from "@/lib/use-game-audio";

type QuickJoinGame = Pick<GameModuleMeta, "id" | "route" | "title">;

type HubActionsProps = {
  games: readonly QuickJoinGame[];
  onSelectedGameIdChange?: (gameId: string) => void;
  selectedGameId?: string;
};

const helpItems = [
  {
    icon: Ticket,
    title: "게임 선택",
    body: "원하는 게임을 고르고 시작을 누르면 해당 게임의 로비로 이동합니다.",
  },
  {
    icon: Users,
    title: "방 만들기",
    body: "호스트가 방을 만들고 참가자가 모이면 설정을 확인한 뒤 라운드를 시작합니다.",
  },
  {
    icon: Keyboard,
    title: "방 코드 참가",
    body: "받은 방 코드를 입력하면 닉네임만 정하고 바로 참가할 수 있습니다.",
  },
  {
    icon: Smartphone,
    title: "모바일 플레이",
    body: "휴대폰에서도 입장, 그림 보기, 정답 입력, 사진 선택을 할 수 있습니다.",
  },
  {
    icon: QrCode,
    title: "QR 입장",
    body: "호스트 화면의 QR을 스캔하면 같은 방으로 빠르게 들어갑니다.",
  },
];

export function HubActions({
  games,
  onSelectedGameIdChange,
  selectedGameId,
}: HubActionsProps) {
  const { playCue } = useGameAudio();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [internalSelectedGameId, setInternalSelectedGameId] = useState(games[0]?.id ?? "");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const currentSelectedGameId = selectedGameId ?? internalSelectedGameId;
  const selectedGame = games.find((game) => game.id === currentSelectedGameId) ?? games[0];
  const canQuickJoin = Boolean(selectedGame && roomCode.length === 6);

  function selectGame(gameId: string) {
    playCue("ui_select");
    setInternalSelectedGameId(gameId);
    onSelectedGameIdChange?.(gameId);
  }

  const openHelp = useCallback(() => {
    playCue("ui_select");
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : helpTriggerRef.current;
    setIsHelpOpen(true);
  }, [playCue]);

  const closeHelp = useCallback(() => {
    playCue("ui_back");
    setIsHelpOpen(false);
    window.setTimeout(() => {
      previousFocusRef.current?.focus();
    }, 0);
  }, [playCue]);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeHelp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeHelp, isHelpOpen]);

  function submitQuickJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGame || !canQuickJoin) {
      playCue("ui_error");
      return;
    }

    playCue("ui_confirm");

    if (selectedGame.id === "draw-duel") {
      window.location.href = `/join/${roomCode}`;
      return;
    }

    const query = new URLSearchParams({ roomCode });
    window.location.href = `${selectedGame.route}/join?${query.toString()}`;
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <form
        aria-describedby="quick-join-status"
        className="arcade-panel grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3 sm:grid-cols-[minmax(180px,0.7fr)_1fr_auto] sm:gap-4 sm:p-4"
        onSubmit={submitQuickJoin}
      >
        <div className="order-1 sm:order-none">
          <label className="text-sm font-black text-screen-white" htmlFor="quick-join-game">
            게임
          </label>
          <select
            className="arcade-input mt-2"
            id="quick-join-game"
            onChange={(event) => selectGame(event.target.value)}
            value={selectedGame?.id ?? ""}
          >
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </div>
        <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
          <label className="text-sm font-black text-screen-white" htmlFor="room-code">
            방 코드
          </label>
          <input
            className="arcade-input mt-2 uppercase"
            id="room-code"
            inputMode="text"
            maxLength={6}
            onChange={(event) =>
              setRoomCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
            }
            placeholder="A1B2C3"
            type="text"
            value={roomCode}
          />
          <p className="mt-2 hidden text-sm text-muted-gray sm:block" id="quick-join-status">
            게임을 선택하고 방 코드를 입력하면 닉네임 입력 화면으로 이동합니다.
          </p>
        </div>
        <button
          className="arcade-button arcade-button-secondary order-2 self-end sm:order-none"
          disabled={!canQuickJoin}
          type="submit"
        >
          <Ticket aria-hidden="true" size={18} />
          바로 참가
        </button>
      </form>

      <div className="grid gap-3 sm:flex">
        <button
          className="arcade-button arcade-button-ghost"
          onClick={openHelp}
          ref={helpTriggerRef}
          type="button"
        >
          <HelpCircle aria-hidden="true" size={18} />
          안내
        </button>
      </div>

      {isHelpOpen ? (
        <div
          aria-labelledby="hub-help-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-console-black/80 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeHelp();
            }
          }}
          role="dialog"
        >
          <div className="arcade-panel max-h-[88vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-arcade text-xs text-electric-cyan">안내</p>
                <h2 className="mt-2 text-2xl font-black text-screen-white" id="hub-help-title">
                  AI Arcade 시작 안내
                </h2>
              </div>
              <button
                aria-label="안내 닫기"
                className="arcade-button arcade-button-ghost h-11 min-h-11 w-11 px-0"
                onClick={closeHelp}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {helpItems.map((item) => {
                const Icon = item.icon;
                return (
                  <article className="border border-line-gray bg-console-black p-4" key={item.title}>
                    <div className="flex items-center gap-3 text-coin-yellow">
                      <Icon aria-hidden="true" size={22} />
                      <h3 className="font-black text-screen-white">{item.title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-gray">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
