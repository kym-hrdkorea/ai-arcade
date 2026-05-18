"use client";

import { createQrSvgDataUrl } from "@ai-arcade/qr-code";
import type {
  ClientToServerEvents,
  EventResponse,
  ServerToClientEvents,
  ThreeWordMonsterImageState,
  ThreeWordMonsterResultPayload,
  ThreeWordMonsterRoomJoinedPayload,
  ThreeWordMonsterRoomState,
  ThreeWordMonsterWords,
} from "@ai-arcade/shared";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clipboard,
  Crown,
  ImageIcon,
  Info,
  Loader2,
  LogOut,
  Maximize2,
  QrCode,
  RotateCcw,
  Send,
  Sparkles,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  Vote,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type LobbyConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error"
  | "reconnecting";

type StoredRoomSession = {
  playerId: string;
  reconnectToken: string;
  roomCode: string;
};

const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";
const reconnectStorageKey = "three-word-monster:reconnect";
const emptyWords: ThreeWordMonsterWords = ["", "", ""];

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
}

function statusText(status: LobbyConnectionStatus) {
  if (status === "connected") {
    return "서버 연결됨";
  }

  if (status === "connecting") {
    return "서버 연결 중";
  }

  if (status === "reconnecting") {
    return "재접속 중";
  }

  if (status === "error") {
    return "연결 오류";
  }

  return "연결 끊김";
}

function friendlyErrorMessage(error: { code: string; message: string }) {
  const messages: Record<string, string> = {
    HOST_ONLY: "호스트만 할 수 있습니다.",
    INVALID_VOTE: "투표 정보를 확인해 주세요.",
    INVALID_WORDS: "단어 3개를 확인해 주세요.",
    MONSTER_NOT_FOUND: "투표할 괴물을 찾을 수 없습니다.",
    NOT_ENOUGH_PLAYERS: "2명 이상 모이면 시작할 수 있습니다.",
    PLAYER_NOT_IN_ROOM: "방 입장 상태를 다시 확인해 주세요.",
    ROOM_FULL: "방이 가득 찼습니다.",
    ROOM_NOT_FOUND: "방을 찾을 수 없습니다.",
    ROOM_NOT_WAITING: "이미 진행 중인 방입니다.",
    SELF_VOTE_NOT_ALLOWED: "자기 괴물에는 투표할 수 없습니다.",
    VOTE_ALREADY_SUBMITTED: "이미 투표했습니다.",
    VOTING_CLOSED: "지금은 투표할 수 없습니다.",
    WORDS_ALREADY_SUBMITTED: "이미 단어를 제출했습니다.",
    WORDS_CLOSED: "지금은 단어를 제출할 수 없습니다.",
  };

  return messages[error.code] ?? error.message;
}

function loadStoredSession(): StoredRoomSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.sessionStorage.getItem(reconnectStorageKey);

  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<StoredRoomSession>;

    if (parsed.roomCode && parsed.playerId && parsed.reconnectToken) {
      return {
        playerId: parsed.playerId,
        reconnectToken: parsed.reconnectToken,
        roomCode: normalizeRoomCode(parsed.roomCode),
      };
    }
  } catch {
    window.sessionStorage.removeItem(reconnectStorageKey);
  }

  return null;
}

function saveStoredSession(session: StoredRoomSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(reconnectStorageKey, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(reconnectStorageKey);
}

function winnerText(result: ThreeWordMonsterResultPayload) {
  if (result.isTie) {
    return `공동 우승 ${result.winners.length}팀`;
  }

  return `${result.winners[0]?.ownerNickname ?? "우승자"} 우승`;
}

function wordLine(words: ThreeWordMonsterWords) {
  return words.join(" + ");
}

function roomStatusLabel(status: ThreeWordMonsterRoomState["status"]) {
  const labels: Record<ThreeWordMonsterRoomState["status"], string> = {
    "image-generating": "괴물 생성 중",
    result: "결과 발표",
    revealing: "결과 집계 중",
    voting: "투표 중",
    waiting: "대기 중",
    "word-submission": "단어 제출",
  };

  return labels[status];
}

function roomStatusHelp(status: ThreeWordMonsterRoomState["status"]) {
  const labels: Record<ThreeWordMonsterRoomState["status"], string> = {
    "image-generating": "모든 단어가 모였습니다. 괴물 이미지를 준비하고 있어요.",
    result: "최다 득표 괴물이 공개됐습니다.",
    revealing: "표를 모아 우승 괴물을 가리고 있어요.",
    voting: "자기 괴물을 제외하고 가장 마음에 드는 괴물에 투표하세요.",
    waiting: "참가자가 모이면 호스트가 게임을 시작합니다.",
    "word-submission": "각자 괴물을 만들 세 단어를 제출합니다.",
  };

  return labels[status];
}

export function ThreeWordMonsterLobby() {
  const searchParams = useSearchParams();
  const initialRoomCode = normalizeRoomCode(searchParams.get("roomCode") ?? "");
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const qrModalCloseButtonRef = useRef<HTMLButtonElement>(null);
  const qrModalTriggerRef = useRef<HTMLButtonElement>(null);
  const previousQrFocusRef = useRef<HTMLElement | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<LobbyConnectionStatus>("connecting");
  const [createNickname, setCreateNickname] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState(initialRoomCode);
  const [room, setRoom] = useState<ThreeWordMonsterRoomState | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [words, setWords] = useState<ThreeWordMonsterWords>(emptyWords);
  const [readyImages, setReadyImages] = useState<ThreeWordMonsterImageState[]>([]);
  const [result, setResult] = useState<ThreeWordMonsterResultPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isQrPanelOpen, setIsQrPanelOpen] = useState(false);

  const openQrModal = useCallback(() => {
    previousQrFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : qrModalTriggerRef.current;
    setIsQrModalOpen(true);
  }, []);

  const closeQrModal = useCallback(() => {
    setIsQrModalOpen(false);
    window.setTimeout(() => {
      previousQrFocusRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (initialRoomCode) {
      setJoinRoomCode(initialRoomCode);
    }
  }, [initialRoomCode]);

  useEffect(() => {
    if (!isQrModalOpen) {
      return;
    }

    qrModalCloseButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeQrModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeQrModal, isQrModalOpen]);

  useEffect(() => {
    if (!room || typeof window === "undefined") {
      setJoinUrl("");
      setQrDataUrl(null);
      return;
    }

    setJoinUrl(
      `${window.location.origin}/games/three-word-monster?roomCode=${room.roomCode}`,
    );
  }, [room]);

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl(null);
      return;
    }

    try {
      setQrDataUrl(
        createQrSvgDataUrl(joinUrl, {
          backgroundColor: "#f8fafc",
          foregroundColor: "#0b1020",
          quietZone: 4,
        }),
      );
    } catch {
      setQrDataUrl(null);
    }
  }, [joinUrl]);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(realtimeUrl);
    socketRef.current = socket;

    function resetGameForm() {
      setWords(emptyWords);
      setReadyImages([]);
      setResult(null);
      setCopyNotice(null);
    }

    function applyJoined(payload: ThreeWordMonsterRoomJoinedPayload) {
      saveStoredSession({
        playerId: payload.currentPlayerId,
        reconnectToken: payload.reconnectToken,
        roomCode: payload.room.roomCode,
      });
      setCurrentPlayerId(payload.currentPlayerId);
      setRoom(payload.room);
      setResult(payload.room.result ?? null);
      setErrorMessage(null);
      setNoticeMessage(null);
      setReadyImages(payload.room.images);
    }

    function attemptStoredRejoin() {
      const storedSession = loadStoredSession();

      if (!storedSession) {
        setConnectionStatus("connected");
        setErrorMessage(null);
        return;
      }

      setConnectionStatus("reconnecting");
      setJoinRoomCode(storedSession.roomCode);
      socket.emit("three-word-monster:room-rejoin", storedSession, (response) => {
        if (!response.ok) {
          clearStoredSession();
          setRoom(null);
          setCurrentPlayerId(null);
          resetGameForm();
          setConnectionStatus(socket.connected ? "connected" : "error");
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        applyJoined(response.data);
        setConnectionStatus("connected");
        setNoticeMessage("방에 다시 연결했습니다.");
      });
    }

    socket.on("connect", () => {
      attemptStoredRejoin();
    });

    socket.on("disconnect", (reason) => {
      setConnectionStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("error");
      setErrorMessage("실시간 서버에 연결하지 못했습니다.");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.io.on("reconnect_failed", () => {
      setConnectionStatus("error");
      setErrorMessage("재접속에 실패했습니다.");
    });

    socket.on("three-word-monster:room-state", (payload) => {
      setRoom(payload.room);
      setResult(payload.room.result ?? null);

      if (payload.room.status === "waiting") {
        resetGameForm();
      }

      if (payload.room.images.length > 0) {
        setReadyImages(payload.room.images);
      }
    });

    socket.on("three-word-monster:game-start", (payload) => {
      setNoticeMessage(payload.message);
      resetGameForm();
    });

    socket.on("three-word-monster:image-ready", (payload) => {
      setReadyImages((current) => {
        if (current.some((image) => image.monsterId === payload.image.monsterId)) {
          return current;
        }

        return [...current, payload.image];
      });
    });

    socket.on("three-word-monster:voting-start", () => {
      setNoticeMessage("괴물 갤러리가 열렸습니다. 자기 괴물을 제외하고 투표하세요.");
    });

    socket.on("three-word-monster:vote-submitted", (payload) => {
      setNoticeMessage(`투표 ${payload.totalVotes}/${payload.voterCount}`);
    });

    socket.on("three-word-monster:result", (payload) => {
      setResult(payload);
      setNoticeMessage("우승 괴물이 공개되었습니다.");
    });

    socket.on("three-word-monster:error", (payload) => {
      setErrorMessage(friendlyErrorMessage(payload));
    });

    return () => {
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.playerId === currentPlayerId) ?? null,
    [currentPlayerId, room],
  );
  const connectedPlayerCount =
    room?.players.filter((player) => player.connectionStatus === "connected").length ?? 0;
  const isHost = Boolean(room && currentPlayerId && room.hostPlayerId === currentPlayerId);
  const hasSubmittedWords = Boolean(
    room?.submissions.some((submission) => submission.playerId === currentPlayerId),
  );
  const ownImage = room?.images.find((image) => image.ownerPlayerId === currentPlayerId) ?? null;
  const currentVote =
    room?.votes.find((vote) => vote.voterPlayerId === currentPlayerId) ?? null;
  const canStart = Boolean(
    isHost && room?.status === "waiting" && connectedPlayerCount >= (room?.minPlayers ?? 2),
  );
  const canSubmitWords = Boolean(
    room?.status === "word-submission" &&
      currentPlayerId &&
      !hasSubmittedWords &&
      words.every((word) => word.trim().length > 0),
  );

  function handleJoined(response: EventResponse<ThreeWordMonsterRoomJoinedPayload>) {
    if (!response.ok) {
      setErrorMessage(friendlyErrorMessage(response.error));
      return;
    }

    saveStoredSession({
      playerId: response.data.currentPlayerId,
      reconnectToken: response.data.reconnectToken,
      roomCode: response.data.room.roomCode,
    });
    setCurrentPlayerId(response.data.currentPlayerId);
    setRoom(response.data.room);
    setReadyImages(response.data.room.images);
    setResult(response.data.room.result ?? null);
    setNoticeMessage(null);
    setErrorMessage(null);
    setCopyNotice(null);
  }

  function submitCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || connectionStatus !== "connected") {
      setErrorMessage("실시간 서버 연결을 확인해 주세요.");
      return;
    }

    socket.emit(
      "three-word-monster:room-create",
      {
        nickname: createNickname,
      },
      handleJoined,
    );
  }

  function submitJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || connectionStatus !== "connected") {
      setErrorMessage("실시간 서버 연결을 확인해 주세요.");
      return;
    }

    socket.emit(
      "three-word-monster:room-join",
      {
        nickname: joinNickname,
        roomCode: joinRoomCode,
      },
      handleJoined,
    );
  }

  function leaveRoom() {
    const socket = socketRef.current;

    if (!socket || !room) {
      clearStoredSession();
      setRoom(null);
      setCurrentPlayerId(null);
      setResult(null);
      return;
    }

    socket.emit("three-word-monster:room-leave", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      clearStoredSession();
      setRoom(null);
      setCurrentPlayerId(null);
      setReadyImages([]);
      setResult(null);
      setNoticeMessage("방에서 나왔습니다.");
      setErrorMessage(null);
    });
  }

  function startGame() {
    const socket = socketRef.current;

    if (!socket || !room) {
      return;
    }

    socket.emit("three-word-monster:game-start", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      setNoticeMessage(response.data.message);
      setErrorMessage(null);
    });
  }

  function submitWords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || !room || !currentPlayerId || !canSubmitWords) {
      return;
    }

    socket.emit(
      "three-word-monster:words-submit",
      {
        playerId: currentPlayerId,
        roomCode: room.roomCode,
        words,
      },
      (response) => {
        if (!response.ok) {
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        setRoom(response.data.room);
        setNoticeMessage(
          response.data.readyToGenerate
            ? "모든 단어가 모였습니다. 괴물을 생성합니다."
            : "단어를 제출했습니다.",
        );
        setErrorMessage(null);
      },
    );
  }

  function submitVote(monsterId: string) {
    const socket = socketRef.current;

    if (!socket || !room || !currentPlayerId) {
      return;
    }

    socket.emit(
      "three-word-monster:vote-submit",
      {
        monsterId,
        playerId: currentPlayerId,
        roomCode: room.roomCode,
      },
      (response) => {
        if (!response.ok) {
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        setNoticeMessage(`투표 ${response.data.totalVotes}/${response.data.voterCount}`);
        setErrorMessage(null);
      },
    );
  }

  function resetRoom() {
    const socket = socketRef.current;

    if (!socket || !room) {
      return;
    }

    socket.emit("three-word-monster:room-reset", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      setRoom(response.data.room);
      setReadyImages([]);
      setResult(null);
      setWords(emptyWords);
      setNoticeMessage("방을 다시 대기 상태로 돌렸습니다.");
      setErrorMessage(null);
    });
  }

  function updateWord(index: 0 | 1 | 2, value: string) {
    setWords(([first, second, third]) => {
      if (index === 0) {
        return [value, second, third];
      }

      if (index === 1) {
        return [first, value, third];
      }

      return [first, second, value];
    });
  }

  async function copyJoinUrl() {
    if (!joinUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopyNotice("초대 링크를 복사했습니다.");
    } catch {
      setCopyNotice("복사하지 못했습니다. 링크를 직접 공유해 주세요.");
    }
  }

  return (
    <main className="min-h-screen bg-console-black text-screen-white">
      <div className="screen-grid min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-gray/80 pb-5">
            <div>
              <p className="font-arcade text-xs uppercase text-electric-cyan">
                몬스터 배틀
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-coin-yellow sm:text-5xl">
                Three Word Monster
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-gray">
                세 단어로 괴물을 만들고, 자기 괴물을 제외한 최강 몬스터에 투표하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="arcade-badge arcade-badge-cyan min-h-12 px-4">
                {statusText(connectionStatus)}
              </div>
              <Link className="arcade-button arcade-button-ghost" href="/">
                <ArrowLeft aria-hidden="true" size={18} />
                허브
              </Link>
            </div>
          </header>

          <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid content-start gap-5">
              {errorMessage ? (
                <div className="border-2 border-joystick-red bg-console-black p-4 font-black text-red-200">
                  {errorMessage}
                </div>
              ) : null}
              {noticeMessage ? (
                <div className="border-2 border-electric-cyan bg-console-black p-4 font-black text-electric-cyan">
                  {noticeMessage}
                </div>
              ) : null}

              {!room ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <form className="arcade-panel p-5 sm:p-6" onSubmit={submitCreateRoom}>
                    <div className="flex items-center gap-3 text-coin-yellow">
                      <Ticket aria-hidden="true" size={24} />
                      <h2 className="text-2xl font-black text-screen-white">방 만들기</h2>
                    </div>
                    <label className="mt-5 block text-sm font-black" htmlFor="monster-create-nickname">
                      닉네임 또는 팀명
                    </label>
                    <input
                      className="arcade-input mt-2"
                      id="monster-create-nickname"
                      maxLength={12}
                      minLength={2}
                      onChange={(event) => setCreateNickname(event.target.value)}
                      placeholder="예: 용감한버튼"
                      required
                      value={createNickname}
                    />
                    <button className="arcade-button arcade-button-primary mt-5 w-full" type="submit">
                      <Sparkles aria-hidden="true" size={18} />방 만들기
                    </button>
                  </form>

                  <form className="arcade-panel p-5 sm:p-6" onSubmit={submitJoinRoom}>
                    <div className="flex items-center gap-3 text-pixel-blue">
                      <UserPlus aria-hidden="true" size={24} />
                      <h2 className="text-2xl font-black text-screen-white">방 참가</h2>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-black" htmlFor="monster-room-code">
                          방 코드
                        </label>
                        <input
                          className="arcade-input mt-2 uppercase"
                          id="monster-room-code"
                          maxLength={6}
                          minLength={6}
                          onChange={(event) =>
                            setJoinRoomCode(normalizeRoomCode(event.target.value))
                          }
                          placeholder="A1B2C3"
                          required
                          value={joinRoomCode}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-black" htmlFor="monster-join-nickname">
                          닉네임
                        </label>
                        <input
                          className="arcade-input mt-2"
                          id="monster-join-nickname"
                          maxLength={12}
                          minLength={2}
                          onChange={(event) => setJoinNickname(event.target.value)}
                          placeholder="예: 번개팀"
                          required
                          value={joinNickname}
                        />
                      </div>
                    </div>
                    <button className="arcade-button arcade-button-secondary mt-5 w-full" type="submit">
                      <UserPlus aria-hidden="true" size={18} />
                      참가하기
                    </button>
                  </form>
                </div>
              ) : (
                <div className="grid gap-5">
                  <section className="arcade-panel grid gap-4 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-arcade text-xs text-electric-cyan">방 코드</p>
                        <h2 className="mt-2 text-3xl font-black text-coin-yellow">
                          {room.roomCode}
                        </h2>
                        <p className="mt-2 text-sm text-muted-gray">
                          {currentPlayer?.nickname ?? "참가자"}로 입장했습니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="arcade-button arcade-button-ghost"
                          onClick={leaveRoom}
                          type="button"
                        >
                          <LogOut aria-hidden="true" size={18} />
                          나가기
                        </button>
                      </div>
                    </div>
                  </section>

                  {isHost ? (
                    <section className="arcade-panel grid gap-4 border-coin-yellow p-5 sm:p-6">
                      <div className="flex items-center gap-3 text-coin-yellow">
                        <Crown aria-hidden="true" size={22} />
                        <h2 className="text-xl font-black text-screen-white">운영 패널</h2>
                      </div>
                      <div className="grid gap-3 border border-line-gray bg-console-black p-3">
                        <button
                          className="arcade-button arcade-button-ghost w-full justify-between"
                          disabled={!joinUrl}
                          onClick={() => setIsQrPanelOpen((current) => !current)}
                          type="button"
                        >
                          <span className="inline-flex items-center gap-2">
                            <QrCode aria-hidden="true" size={18} />
                            QR 입장
                          </span>
                          {isQrPanelOpen ? (
                            <ChevronUp aria-hidden="true" size={18} />
                          ) : (
                            <ChevronDown aria-hidden="true" size={18} />
                          )}
                        </button>

                        {isQrPanelOpen ? (
                          <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)]">
                            <div className="flex h-32 w-32 items-center justify-center border-2 border-screen-white bg-screen-white p-2">
                              {qrDataUrl ? (
                                <span
                                  aria-label={`${room.roomCode} 방 참가 QR`}
                                  className="h-full w-full"
                                  role="img"
                                  style={{
                                    backgroundImage: `url("${qrDataUrl}")`,
                                    backgroundPosition: "center",
                                    backgroundRepeat: "no-repeat",
                                    backgroundSize: "contain",
                                  }}
                                />
                              ) : (
                                <QrCode aria-hidden="true" className="text-console-black" size={54} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-arcade text-xs text-electric-cyan">참가 링크</p>
                              <p className="mt-2 break-all text-sm font-bold leading-6 text-screen-white">
                                {joinUrl}
                              </p>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <button
                                  className="arcade-button arcade-button-primary"
                                  onClick={() => void copyJoinUrl()}
                                  type="button"
                                >
                                  <Clipboard aria-hidden="true" size={18} />
                                  복사
                                </button>
                                <button
                                  className="arcade-button arcade-button-secondary"
                                  disabled={!qrDataUrl}
                                  onClick={openQrModal}
                                  ref={qrModalTriggerRef}
                                  type="button"
                                >
                                  <Maximize2 aria-hidden="true" size={18} />
                                  크게 보기
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {copyNotice ? (
                        <p className="text-sm font-bold text-health-green">{copyNotice}</p>
                      ) : null}
                    </section>
                  ) : null}

                  {room.status === "waiting" ? (
                    <section className="arcade-panel grid gap-5 p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3 text-coin-yellow">
                          <Users aria-hidden="true" size={24} />
                          <h2 className="text-2xl font-black text-screen-white">대기실</h2>
                        </div>
                        <div className="arcade-badge arcade-badge-cyan min-h-10 px-3">
                          참가 {connectedPlayerCount}/{room.maxPlayers}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {["세 단어를 입력합니다", "내 괴물은 투표 제외", "최다 득표 괴물이 우승"].map(
                          (rule) => (
                            <div
                              className="flex min-h-14 items-center gap-2 border border-line-gray bg-console-black px-3 py-2 text-sm font-bold text-screen-white"
                              key={rule}
                            >
                              <CheckCircle2 aria-hidden="true" className="text-health-green" size={18} />
                              {rule}
                            </div>
                          ),
                        )}
                      </div>
                      <div className="border border-line-gray bg-console-black p-4">
                        <p className="flex items-center gap-2 text-sm font-bold text-muted-gray">
                          <Info aria-hidden="true" className="text-electric-cyan" size={18} />
                          {isHost
                            ? connectedPlayerCount >= room.minPlayers
                              ? "준비가 끝났습니다. 게임을 시작하세요."
                              : "2명 이상 모이면 게임을 시작할 수 있습니다."
                            : "호스트가 게임을 시작하면 단어 입력이 열립니다."}
                        </p>
                      </div>
                      {isHost ? (
                        <button
                          className="arcade-button arcade-button-primary"
                          disabled={!canStart}
                          onClick={startGame}
                          type="button"
                        >
                          <Sparkles aria-hidden="true" size={18} />
                          게임 시작
                        </button>
                      ) : null}
                    </section>
                  ) : null}

                  {room.status === "word-submission" ? (
                    <section className="arcade-panel grid gap-5 p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-coin-yellow">
                          <Sparkles aria-hidden="true" size={24} />
                          <h2 className="text-2xl font-black text-screen-white">3단어 입력</h2>
                        </div>
                        <div className="arcade-badge arcade-badge-yellow">
                          제출 {room.submissions.length}/{connectedPlayerCount}
                        </div>
                      </div>
                      <p className="text-sm leading-6 text-muted-gray">
                        서로 다른 느낌의 단어 3개를 넣으면 같은 규칙으로 괴물 이미지가 생성됩니다.
                      </p>
                      {hasSubmittedWords ? (
                        <div className="border-2 border-health-green bg-console-black p-4 font-black text-health-green">
                          제출 완료. 다른 참가자를 기다리고 있습니다.
                        </div>
                      ) : (
                        <form className="grid gap-4" onSubmit={submitWords}>
                          {[0, 1, 2].map((index) => (
                            <label className="grid gap-2 text-sm font-black" htmlFor={`monster-word-${index}`} key={index}>
                              단어 {index + 1}
                              <input
                                className="arcade-input"
                                id={`monster-word-${index}`}
                                maxLength={12}
                                onChange={(event) =>
                                  updateWord(index as 0 | 1 | 2, event.target.value)
                                }
                                placeholder={index === 0 ? "예: 용" : index === 1 ? "우산" : "로봇"}
                                required
                                value={words[index as 0 | 1 | 2]}
                              />
                            </label>
                          ))}
                          <button
                            className="arcade-button arcade-button-secondary"
                            disabled={!canSubmitWords}
                            type="submit"
                          >
                            <Send aria-hidden="true" size={18} />
                            단어 제출
                          </button>
                        </form>
                      )}
                    </section>
                  ) : null}

                  {room.status === "image-generating" ? (
                    <section className="arcade-panel grid place-items-center gap-4 p-8 text-center">
                      <Loader2 aria-hidden="true" className="animate-spin text-electric-cyan" size={48} />
                      <h2 className="text-2xl font-black text-screen-white">괴물 생성 중</h2>
                      <p className="text-sm text-muted-gray">
                        준비된 이미지 {readyImages.length}/{connectedPlayerCount}
                      </p>
                      <p className="max-w-md text-sm leading-6 text-muted-gray">
                        모든 이미지가 준비되면 갤러리가 열리고, 자기 괴물을 제외한 후보에 투표합니다.
                      </p>
                    </section>
                  ) : null}

                  {room.status === "voting" ? (
                    <MonsterGallery
                      currentPlayerId={currentPlayerId}
                      currentVoteMonsterId={currentVote?.targetMonsterId ?? null}
                      images={room.images}
                      onVote={submitVote}
                      voteCount={room.votes.length}
                      voterCount={room.images.length}
                    />
                  ) : null}

                  {room.status === "result" && (result ?? room.result) ? (
                    <ResultPanel
                      isHost={isHost}
                      onReset={resetRoom}
                      result={(result ?? room.result) as ThreeWordMonsterResultPayload}
                    />
                  ) : null}
                </div>
              )}
            </div>

            <aside className="grid content-start gap-5">
              <section className="arcade-panel p-5">
                <div className="flex items-center gap-3 text-pixel-blue">
                  <Users aria-hidden="true" size={22} />
                  <h2 className="text-xl font-black text-screen-white">참가자</h2>
                </div>
                <div className="mt-4 grid gap-2">
                  {room?.players.length ? (
                    room.players.map((player) => (
                      <div
                        className="flex items-center justify-between gap-3 border border-line-gray bg-console-black px-3 py-2"
                        key={player.playerId}
                      >
                        <span className="font-black">{player.nickname}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-gray">
                          {player.playerId === room.hostPlayerId ? (
                            <Crown aria-hidden="true" className="text-coin-yellow" size={15} />
                          ) : null}
                          {player.connectionStatus === "connected" ? "접속" : "자리 비움"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-gray">아직 입장한 참가자가 없습니다.</p>
                  )}
                </div>
              </section>

              {room ? (
                <section className="arcade-panel grid gap-3 p-5">
                  <div className="flex items-center gap-3 text-coin-yellow">
                    <ImageIcon aria-hidden="true" size={22} />
                    <h2 className="text-xl font-black text-screen-white">현재 상태</h2>
                  </div>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-gray">단계</dt>
                      <dd className="font-black">{roomStatusLabel(room.status)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-gray">제출</dt>
                      <dd className="font-black">{room.submissions.length}/{connectedPlayerCount}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-gray">이미지</dt>
                      <dd className="font-black">{room.images.length}/{connectedPlayerCount}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-gray">내 괴물</dt>
                      <dd className="font-black">{ownImage ? "생성됨" : "대기"}</dd>
                    </div>
                  </dl>
                  <p className="border-t border-line-gray pt-3 text-sm leading-6 text-muted-gray">
                    {roomStatusHelp(room.status)}
                  </p>
                </section>
              ) : null}
            </aside>
          </section>
        </div>
      </div>

      {isQrModalOpen && room ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-console-black/85 px-4 py-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeQrModal();
            }
          }}
          role="dialog"
        >
          <div className="arcade-panel grid w-full max-w-lg gap-5 border-2 border-coin-yellow bg-panel-gray p-5 shadow-panel sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-arcade text-xs text-electric-cyan">QR 입장</p>
                <h3 className="mt-2 text-2xl font-black text-screen-white">
                  방 코드 <span className="font-arcade text-coin-yellow">{room.roomCode}</span>
                </h3>
              </div>
              <button
                aria-label="QR 모달 닫기"
                className="arcade-button arcade-button-ghost h-12 w-12 p-0"
                onClick={closeQrModal}
                ref={qrModalCloseButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <div className="grid place-items-center border-2 border-line-gray bg-console-black p-4">
              <div className="flex aspect-square w-full max-w-80 items-center justify-center border-4 border-screen-white bg-screen-white p-4">
                {qrDataUrl ? (
                  <span
                    aria-label={`${room.roomCode} 방 참가 QR`}
                    className="h-full w-full"
                    role="img"
                    style={{
                      backgroundImage: `url("${qrDataUrl}")`,
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      backgroundSize: "contain",
                    }}
                  />
                ) : (
                  <QrCode aria-hidden="true" className="text-console-black" size={96} />
                )}
              </div>
            </div>
            <div className="grid gap-3 border border-line-gray bg-console-black p-3">
              <p className="break-all text-sm font-bold leading-6 text-screen-white">{joinUrl}</p>
              {copyNotice ? <p className="text-sm text-health-green">{copyNotice}</p> : null}
              <button className="arcade-button arcade-button-primary" onClick={() => void copyJoinUrl()} type="button">
                <Clipboard aria-hidden="true" size={18} />
                링크 복사
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MonsterGallery({
  currentPlayerId,
  currentVoteMonsterId,
  images,
  onVote,
  voteCount,
  voterCount,
}: {
  currentPlayerId: string | null;
  currentVoteMonsterId: string | null;
  images: ThreeWordMonsterImageState[];
  onVote: (monsterId: string) => void;
  voteCount: number;
  voterCount: number;
}) {
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-coin-yellow">
          <Vote aria-hidden="true" size={24} />
          <h2 className="text-2xl font-black text-screen-white">괴물 갤러리</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="arcade-badge arcade-badge-cyan">투표 {voteCount}/{voterCount}</div>
          {currentVoteMonsterId ? (
            <div className="arcade-badge arcade-badge-green">내 투표 완료</div>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-6 text-muted-gray">
        자기 괴물을 제외하고 가장 마음에 드는 후보를 하나 선택하세요. 모두 투표하면 결과가 공개됩니다.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {images.map((image, index) => {
          const isOwn = image.ownerPlayerId === currentPlayerId;
          const isSelected = image.monsterId === currentVoteMonsterId;

          return (
            <article className="arcade-panel overflow-hidden p-3" key={image.monsterId}>
              <div className="relative aspect-square overflow-hidden border-2 border-line-gray bg-console-black">
                <Image
                  alt={`괴물 후보 ${index + 1}`}
                  className="object-cover"
                  height={512}
                  src={image.imageDataUrl}
                  unoptimized
                  width={512}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="arcade-badge">#{index + 1}</span>
                {isOwn ? <span className="arcade-badge arcade-badge-yellow">내 괴물</span> : null}
              </div>
              <button
                className={`arcade-button mt-3 w-full ${
                  isSelected ? "arcade-button-secondary" : "arcade-button-primary"
                }`}
                disabled={isOwn || Boolean(currentVoteMonsterId)}
                onClick={() => onVote(image.monsterId)}
                type="button"
              >
                <Trophy aria-hidden="true" size={18} />
                {isSelected ? "선택한 괴물" : isOwn ? "내 괴물은 투표 제외" : "투표"}
              </button>
              {isOwn ? (
                <p className="mt-2 text-sm font-bold text-muted-gray">
                  자기 괴물에는 투표할 수 없습니다.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultPanel({
  isHost,
  onReset,
  result,
}: {
  isHost: boolean;
  onReset: () => void;
  result: ThreeWordMonsterResultPayload;
}) {
  return (
    <section className="grid gap-5">
      <div className="arcade-panel border-2 border-coin-yellow p-5 text-center sm:p-6">
        <p className="font-arcade text-xs text-electric-cyan">결과 발표</p>
        <h2 className="mt-3 text-4xl font-black text-coin-yellow">{winnerText(result)}</h2>
        <p className="mt-3 text-sm text-muted-gray">
          {result.isTie ? "동점으로 공동 우승입니다." : "최다 득표 괴물이 우승했습니다."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.entries.map((entry) => (
          <article
            className={`arcade-panel overflow-hidden p-3 ${
              entry.isWinner ? "border-coin-yellow" : ""
            }`}
            key={entry.monsterId}
          >
            <div className="relative aspect-square overflow-hidden border-2 border-line-gray bg-console-black">
              <Image
                alt={`${entry.ownerNickname} 괴물`}
                className="object-cover"
                height={512}
                src={entry.imageDataUrl}
                unoptimized
                width={512}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-black">
                #{entry.rank} {entry.ownerNickname}
              </span>
              <span className="arcade-badge arcade-badge-cyan">{entry.votes}표</span>
            </div>
            <p className="mt-2 text-sm font-bold text-muted-gray">{wordLine(entry.words)}</p>
          </article>
        ))}
      </div>

      {isHost ? (
        <button className="arcade-button arcade-button-primary" onClick={onReset} type="button">
          <RotateCcw aria-hidden="true" size={18} />
          다시 시작
        </button>
      ) : null}
    </section>
  );
}
