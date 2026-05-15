"use client";

import { HelpCircle, Keyboard, Settings, Smartphone, Ticket, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const helpItems = [
  {
    icon: Ticket,
    title: "게임 선택",
    body: "카드를 고르고 시작을 누르면 해당 게임 로비로 이동합니다.",
  },
  {
    icon: Users,
    title: "방 만들기",
    body: "Draw Duel 로비에서 호스트가 방을 만들고 참가자를 기다립니다.",
  },
  {
    icon: Keyboard,
    title: "방 코드 참가",
    body: "Phase 2에서 방 코드 입력으로 바로 참가할 수 있게 연결합니다.",
  },
  {
    icon: Smartphone,
    title: "모바일 플레이",
    body: "모바일에서도 닉네임 입력과 정답 제출을 쉽게 할 수 있게 맞춥니다.",
  },
];

export function HubActions() {
  const router = useRouter();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const canQuickJoin = roomCode.length === 6;

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsHelpOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHelpOpen]);

  return (
    <section className="grid gap-4 pb-6 lg:grid-cols-[1fr_auto]">
      <form
        aria-describedby="quick-join-status"
        className="arcade-panel grid gap-4 p-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();

          if (canQuickJoin) {
            router.push(`/games/draw-duel/join?roomCode=${roomCode}`);
          }
        }}
      >
        <div>
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
          <p className="mt-2 text-sm text-muted-gray" id="quick-join-status">
            방 코드를 입력하면 닉네임만 입력하는 참가 화면으로 이동합니다.
          </p>
        </div>
        <button
          className="arcade-button arcade-button-secondary self-end"
          disabled={!canQuickJoin}
          type="submit"
        >
          <Ticket aria-hidden="true" size={18} />
          바로 참가
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:flex">
        <button
          className="arcade-button arcade-button-ghost"
          onClick={() => setIsHelpOpen(true)}
          type="button"
        >
          <HelpCircle aria-hidden="true" size={18} />
          도움말
        </button>
        <button
          className="arcade-button arcade-button-ghost"
          disabled
          type="button"
        >
          <Settings aria-hidden="true" size={18} />
          설정 준비 중
        </button>
      </div>

      {isHelpOpen ? (
        <div
          aria-labelledby="hub-help-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-console-black/80 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsHelpOpen(false);
            }
          }}
          role="dialog"
        >
          <div className="arcade-panel max-h-[88vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-arcade text-xs text-electric-cyan">Help</p>
                <h2 className="mt-2 text-2xl font-black text-screen-white" id="hub-help-title">
                  AI Arcade 시작 안내
                </h2>
              </div>
              <button
                aria-label="도움말 닫기"
                className="arcade-button arcade-button-ghost h-11 min-h-11 w-11 px-0"
                onClick={() => setIsHelpOpen(false)}
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
