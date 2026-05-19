"use client";

import { createQrSvgDataUrl } from "@ai-arcade/qr-code";
import type {
  ClientToServerEvents,
  EventResponse,
  RealOrAiAnswerAckPayload,
  RealOrAiAnswerCountPayload,
  RealOrAiCountdownPayload,
  RealOrAiCountdownSeconds,
  RealOrAiGameResultPayload,
  RealOrAiRoomJoinedPayload,
  RealOrAiRoomState,
  RealOrAiRoundDurationSeconds,
  RealOrAiRoundResultPayload,
  RealOrAiRoundStartPayload,
  RealOrAiSettings,
  RealOrAiTimerTickPayload,
  ServerToClientEvents,
} from "@ai-arcade/shared";
import {
  REAL_OR_AI_COUNTDOWN_SECONDS_OPTIONS,
  REAL_OR_AI_ROUND_DURATION_OPTIONS,
} from "@ai-arcade/shared";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Crown,
  LogOut,
  Maximize2,
  Minus,
  Play,
  Plus,
  Plug,
  PlugZap,
  QrCode,
  RotateCcw,
  Settings2,
  Ticket,
  Timer,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import {
  RealOrAiAnsweringPanel,
  RealOrAiFinalResultPanel,
  RealOrAiRoundResultPanel,
} from "./real-or-ai-play-surface";

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

type RealOrAiLobbyProps = {
  entryMode?: "full" | "join-only";
};

const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";
const reconnectStorageKey = "real-or-ai:reconnect";
const roundDurationGroups: {
  durations: readonly RealOrAiRoundDurationSeconds[];
  help: string;
  title: string;
}[] = [
  {
    durations: [5, 10, 15],
    help: "짧게 즐기는 빠른 라운드",
    title: "빠른 진행",
  },
  {
    durations: [30, 45, 60],
    help: "실제 사진을 꼼꼼히 비교",
    title: "꼼꼼히 보기",
  },
];

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

function roomStatusLabel(status: RealOrAiRoomState["status"]) {
  const labels: Record<RealOrAiRoomState["status"], string> = {
    answering: "진행 중",
    countdown: "카운트다운",
    "final-result": "최종 결과",
    "round-result": "라운드 결과",
    waiting: "대기 중",
  };

  return labels[status];
}

function roomStatusHelp(status: RealOrAiRoomState["status"]) {
  const labels: Record<RealOrAiRoomState["status"], string> = {
    answering: "두 후보를 돋보기로 확인하고 진짜 사진을 골라 주세요.",
    countdown: "곧 진짜 사진 고르기가 시작됩니다.",
    "final-result": "최종 순위를 확인하고 다음 게임을 준비합니다.",
    "round-result": "라운드가 끝났습니다. 호스트가 다음 진행을 선택합니다.",
    waiting: "참가자가 모이면 호스트가 설정을 확인하고 시작합니다.",
  };

  return labels[status];
}

function friendlyErrorMessage(error: { code: string; message: string }) {
  const messages: Record<string, string> = {
    ANSWER_CLOSED: "지금은 답을 제출할 수 없습니다.",
    COUNTDOWN_NOT_ACTIVE: "카운트다운 상태를 확인해 주세요.",
    HOST_ONLY: "호스트만 사용할 수 있습니다.",
    INVALID_SETTINGS: "설정 값을 확인해 주세요.",
    NOT_ENOUGH_PLAYERS: "2명 이상 모이면 시작할 수 있습니다.",
    NOT_ENOUGH_ROUND_ITEMS: "사용 가능한 라운드 이미지가 부족합니다.",
    PLAYER_NOT_IN_ROOM: "방 입장 상태를 다시 확인해 주세요.",
    REJOIN_FAILED: "재접속에 실패했습니다. 방 코드로 다시 입장해 주세요.",
    ROOM_FULL: "방이 가득 찼습니다.",
    ROOM_NOT_FOUND: "방을 찾을 수 없습니다.",
    ROOM_NOT_WAITING: "이미 진행 중인 방입니다.",
  };

  return messages[error.code] ?? error.message;
}

function loadStoredSession(initialRoomCode: string): StoredRoomSession | null {
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
      const roomCode = normalizeRoomCode(parsed.roomCode);

      if (initialRoomCode && roomCode !== initialRoomCode) {
        return null;
      }

      return {
        playerId: parsed.playerId,
        reconnectToken: parsed.reconnectToken,
        roomCode,
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

function parseRoundDuration(value: string): RealOrAiRoundDurationSeconds | null {
  const candidate = Number(value) as RealOrAiRoundDurationSeconds;

  return REAL_OR_AI_ROUND_DURATION_OPTIONS.includes(candidate) ? candidate : null;
}

function parseCountdownSeconds(value: string): RealOrAiCountdownSeconds | null {
  const candidate = Number(value) as RealOrAiCountdownSeconds;

  return REAL_OR_AI_COUNTDOWN_SECONDS_OPTIONS.includes(candidate) ? candidate : null;
}

function saveJoinedSession(payload: RealOrAiRoomJoinedPayload) {
  saveStoredSession({
    playerId: payload.currentPlayerId,
    reconnectToken: payload.reconnectToken,
    roomCode: payload.room.roomCode,
  });
}

export function RealOrAiLobby({ entryMode = "full" }: RealOrAiLobbyProps) {
  const searchParams = useSearchParams();
  const initialRoomCode = normalizeRoomCode(searchParams.get("roomCode") ?? "");
  const isJoinOnly = entryMode === "join-only";
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const qrModalCloseButtonRef = useRef<HTMLButtonElement>(null);
  const qrModalTriggerRef = useRef<HTMLButtonElement>(null);
  const previousQrFocusRef = useRef<HTMLElement | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState<LobbyConnectionStatus>("connecting");
  const [createNickname, setCreateNickname] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState(initialRoomCode);
  const [room, setRoom] = useState<RealOrAiRoomState | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<RealOrAiCountdownPayload | null>(null);
  const [roundStart, setRoundStart] = useState<RealOrAiRoundStartPayload | null>(null);
  const [timer, setTimer] = useState<RealOrAiTimerTickPayload | null>(null);
  const [roundResult, setRoundResult] = useState<RealOrAiRoundResultPayload | null>(null);
  const [gameResult, setGameResult] = useState<RealOrAiGameResultPayload | null>(null);
  const [answerCount, setAnswerCount] = useState<RealOrAiAnswerCountPayload | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [submittedAnswer, setSubmittedAnswer] =
    useState<RealOrAiAnswerAckPayload | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isAdvancingRound, setIsAdvancingRound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isQrPanelOpen, setIsQrPanelOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

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

    setJoinUrl(`${window.location.origin}/games/real-or-ai/join?roomCode=${room.roomCode}`);
  }, [room]);

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl(null);
      return;
    }

    try {
      setQrDataUrl(
        createQrSvgDataUrl(joinUrl, {
          backgroundColor: "#F8FAFC",
          foregroundColor: "#0F172A",
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

    socket.on("connect", () => {
      setConnectionStatus("connected");
      setErrorMessage(null);

      const storedSession = loadStoredSession(initialRoomCode);

      if (!storedSession) {
        return;
      }

      socket.emit("real-or-ai:room-rejoin", storedSession, (response) => {
        if (response.ok) {
          saveJoinedSession(response.data);
          setCurrentPlayerId(response.data.currentPlayerId);
          setRoom(response.data.room);
          setJoinRoomCode(response.data.room.roomCode);
          setNoticeMessage("방에 다시 연결되었습니다.");
          return;
        }

        clearStoredSession();
      });
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("error");
      setErrorMessage("게임 서버 연결을 확인해 주세요.");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.io.on("reconnect_failed", () => {
      setConnectionStatus("error");
    });

    socket.on("real-or-ai:room-state", (payload) => {
      setRoom(payload.room);

      if (payload.room.status === "waiting") {
        setCountdown(null);
        setRoundStart(null);
        setTimer(null);
        setRoundResult(null);
        setGameResult(null);
        setAnswerCount(null);
        setSelectedCandidateId(null);
        setSubmittedAnswer(null);
        setIsSubmittingAnswer(false);
        setIsAdvancingRound(false);
      }
    });

    socket.on("real-or-ai:settings-updated", () => {
      setNoticeMessage("설정이 업데이트되었습니다.");
    });

    socket.on("real-or-ai:countdown", (payload) => {
      setCountdown(payload);
      setRoundStart(null);
      setTimer(null);
      setRoundResult(null);
      setGameResult(null);
      setAnswerCount(null);
      setSelectedCandidateId(null);
      setSubmittedAnswer(null);
      setIsSubmittingAnswer(false);
      setIsAdvancingRound(false);
    });

    socket.on("real-or-ai:round-start", (payload) => {
      setCountdown(null);
      setRoundStart(payload);
      setRoundResult(null);
      setAnswerCount(null);
      setSelectedCandidateId(null);
      setSubmittedAnswer(null);
      setIsSubmittingAnswer(false);
      setIsAdvancingRound(false);
    });

    socket.on("real-or-ai:timer-tick", (payload) => {
      setTimer(payload);
    });

    socket.on("real-or-ai:answer-ack", (payload) => {
      setSubmittedAnswer(payload);
      setSelectedCandidateId(payload.selectedCandidateId);
      setIsSubmittingAnswer(false);
    });

    socket.on("real-or-ai:answer-count", (payload) => {
      setAnswerCount(payload);
    });

    socket.on("real-or-ai:round-result", (payload) => {
      setRoundResult(payload);
      setCountdown(null);
      setTimer(null);
      setIsSubmittingAnswer(false);
      setIsAdvancingRound(false);
    });

    socket.on("real-or-ai:game-result", (payload) => {
      setGameResult(payload);
      setCountdown(null);
      setTimer(null);
      setRoundResult(null);
      setAnswerCount(null);
      setSelectedCandidateId(null);
      setSubmittedAnswer(null);
      setIsSubmittingAnswer(false);
      setIsAdvancingRound(false);
    });

    socket.on("real-or-ai:error", (payload) => {
      setErrorMessage(friendlyErrorMessage(payload));
    });

    return () => {
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [initialRoomCode]);

  const connectedPlayerCount =
    room?.players.filter((player) => player.connectionStatus === "connected").length ?? 0;
  const isHost = Boolean(room && currentPlayerId && room.hostPlayerId === currentPlayerId);
  const canStart = Boolean(
    isHost && room?.status === "waiting" && connectedPlayerCount >= room.minPlayers,
  );
  const roundCountMax = Math.max(1, room?.playableRoundCount ?? 1);
  const activeRound = roundStart?.round ?? room?.currentRound ?? null;
  const operationRoundNumber = activeRound?.roundNumber ?? roundResult?.roundNumber;
  const operationTotalRounds =
    activeRound?.totalRounds ?? roundResult?.totalRounds ?? room?.settings.roundCount;
  const operationRoundText =
    operationRoundNumber && operationTotalRounds
      ? `${operationRoundNumber}/${operationTotalRounds}`
      : "대기";
  const operationRemainingSeconds =
    room?.status === "countdown"
      ? countdown?.remainingSeconds ?? room.settings.countdownSeconds
      : room?.status === "answering" && activeRound
        ? timer?.roundId === activeRound.roundId
          ? timer.remainingSeconds
          : room.settings.roundDurationSeconds
        : "-";
  const operationSubmittedCount =
    activeRound && answerCount?.roundId === activeRound.roundId
      ? answerCount.submittedCount
      : activeRound && submittedAnswer?.roundId === activeRound.roundId
        ? 1
        : roundResult
          ? roundResult.entries.filter((entry) => entry.selectedCandidateId).length
          : 0;
  const canSkipRound = Boolean(isHost && room?.status === "answering");
  const canAdvanceFromOperations = Boolean(
    isHost && room?.status === "round-result" && roundResult && !isAdvancingRound,
  );

  function handleJoined(response: EventResponse<RealOrAiRoomJoinedPayload>) {
    if (!response.ok) {
      setErrorMessage(friendlyErrorMessage(response.error));
      return;
    }

    saveJoinedSession(response.data);
    setCurrentPlayerId(response.data.currentPlayerId);
    setRoom(response.data.room);
    setJoinRoomCode(response.data.room.roomCode);
    setCountdown(null);
    setRoundStart(null);
    setTimer(null);
    setRoundResult(null);
    setGameResult(null);
    setAnswerCount(null);
    setSelectedCandidateId(null);
    setSubmittedAnswer(null);
    setIsSubmittingAnswer(false);
    setIsAdvancingRound(false);
    setErrorMessage(null);
    setNoticeMessage("방에 입장했습니다.");
  }

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || connectionStatus !== "connected") {
      setErrorMessage("게임 서버 연결을 확인해 주세요.");
      return;
    }

    socket.emit(
      "real-or-ai:room-create",
      {
        nickname: createNickname.trim(),
      },
      handleJoined,
    );
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || connectionStatus !== "connected") {
      setErrorMessage("게임 서버 연결을 확인해 주세요.");
      return;
    }

    socket.emit(
      "real-or-ai:room-join",
      {
        nickname: joinNickname.trim(),
        roomCode: joinRoomCode,
      },
      handleJoined,
    );
  }

  function leaveRoom() {
    const socket = socketRef.current;

    if (!socket || !room) {
      return;
    }

    socket.emit("real-or-ai:room-leave", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      clearStoredSession();
      setRoom(null);
      setCurrentPlayerId(null);
      setCountdown(null);
      setRoundStart(null);
      setTimer(null);
      setRoundResult(null);
      setGameResult(null);
      setAnswerCount(null);
      setSelectedCandidateId(null);
      setSubmittedAnswer(null);
      setIsSubmittingAnswer(false);
      setIsAdvancingRound(false);
      setNoticeMessage("방에서 나왔습니다.");
    });
  }

  function updateSettings(settings: RealOrAiSettings) {
    const socket = socketRef.current;

    if (!socket || !room || !isHost) {
      return;
    }

    socket.emit(
      "real-or-ai:settings-update",
      {
        roomCode: room.roomCode,
        settings,
      },
      (response) => {
        if (!response.ok) {
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        setRoom(response.data.room);
        setErrorMessage(null);
      },
    );
  }

  function startGame() {
    const socket = socketRef.current;

    if (!socket || !room || !canStart) {
      return;
    }

    socket.emit("real-or-ai:game-start", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      setNoticeMessage(response.data.message);
    });
  }

  function submitAnswer() {
    const socket = socketRef.current;

    if (
      !socket ||
      !room ||
      !currentPlayerId ||
      !activeRound ||
      !selectedCandidateId ||
      submittedAnswer?.roundId === activeRound.roundId
    ) {
      return;
    }

    setIsSubmittingAnswer(true);
    socket.emit(
      "real-or-ai:answer-submit",
      {
        playerId: currentPlayerId,
        roomCode: room.roomCode,
        roundId: activeRound.roundId,
        selectedCandidateId,
      },
      (response) => {
        setIsSubmittingAnswer(false);

        if (!response.ok) {
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        setSubmittedAnswer(response.data);
        setSelectedCandidateId(response.data.selectedCandidateId);
        setErrorMessage(null);
      },
    );
  }

  function nextRound() {
    const socket = socketRef.current;

    if (!socket || !room || !isHost) {
      return;
    }

    setIsAdvancingRound(true);
    socket.emit("real-or-ai:next-round", { roomCode: room.roomCode }, (response) => {
      setIsAdvancingRound(false);

      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      setErrorMessage(null);
    });
  }

  function skipRound() {
    const socket = socketRef.current;

    if (!socket || !room || !isHost || room.status !== "answering") {
      return;
    }

    socket.emit("real-or-ai:round-skip", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      setRoundResult(response.data);
      setTimer(null);
      setErrorMessage(null);
    });
  }

  function resetRoom() {
    const socket = socketRef.current;

    if (!socket || !room || !isHost) {
      return;
    }

    socket.emit("real-or-ai:room-reset", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      setRoom(response.data.room);
      setCountdown(null);
      setRoundStart(null);
      setTimer(null);
      setRoundResult(null);
      setGameResult(null);
      setAnswerCount(null);
      setSelectedCandidateId(null);
      setSubmittedAnswer(null);
      setIsSubmittingAnswer(false);
      setIsAdvancingRound(false);
      setNoticeMessage("방을 대기 상태로 되돌렸습니다.");
    });
  }

  async function copyJoinUrl() {
    if (!joinUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyNotice("복사할 링크가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopyNotice("참가 링크를 복사했습니다.");
    } catch {
      setCopyNotice("브라우저에서 복사를 허용하지 않았습니다.");
    }
  }

  function changeRoundCount(delta: number) {
    if (!room || !isHost || room.status !== "waiting") {
      return;
    }

    updateSettings({
      ...room.settings,
      roundCount: Math.min(roundCountMax, Math.max(1, room.settings.roundCount + delta)),
    });
  }

  const renderSettingsSummary = (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="arcade-meter">
        <strong>{room?.settings.roundCount ?? "-"}</strong>
        <span>라운드</span>
      </div>
      <div className="arcade-meter">
        <strong>{room?.settings.roundDurationSeconds ?? "-"}</strong>
        <span>초 제한</span>
      </div>
      <div className="arcade-meter">
        <strong>{room?.settings.countdownSeconds ?? "-"}</strong>
        <span>초 준비</span>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-console-black text-screen-white">
      <div className="screen-grid min-h-screen px-4 py-5 sm:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col gap-5">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-gray/80 pb-4">
            <Link className="arcade-button arcade-button-ghost" href="/">
              <ArrowLeft aria-hidden="true" size={18} />
              허브로
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <span className="arcade-badge arcade-badge-yellow">테스트 가능</span>
              <span className="arcade-badge">
                {connectionStatus === "connected" ? (
                  <PlugZap aria-hidden="true" size={15} />
                ) : (
                  <Plug aria-hidden="true" size={15} />
                )}
                {statusText(connectionStatus)}
              </span>
            </div>
          </header>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="arcade-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-arcade text-xs text-electric-cyan">사진 판별 로비</p>
                  <h1 className="mt-2 text-3xl font-black text-coin-yellow sm:text-5xl">
                    Real or AI
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-gray sm:text-base">
                    실제 사진과 AI 생성 사진을 비교해 진짜를 빠르게 고르는 게임입니다.
                    돋보기로 사진을 꼼꼼히 확인하고 라운드 결과와 최종 랭킹까지 이어집니다.
                  </p>
                </div>
                {room ? (
                  <div className="min-w-40 border border-line-gray bg-console-black p-3 text-right">
                    <p className="text-xs font-bold text-muted-gray">방 코드</p>
                    <p className="mt-1 font-arcade text-2xl text-screen-white">{room.roomCode}</p>
                  </div>
                ) : null}
              </div>

              {errorMessage ? (
                <p className="mt-4 border border-joystick-red bg-joystick-red/15 p-3 text-sm font-bold text-screen-white">
                  {errorMessage}
                </p>
              ) : null}
              {noticeMessage ? (
                <p className="mt-4 border border-health-green bg-health-green/15 p-3 text-sm font-bold text-screen-white">
                  {noticeMessage}
                </p>
              ) : null}

              {!room ? (
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {!isJoinOnly ? (
                    <form className="border border-line-gray bg-console-black p-4" onSubmit={createRoom}>
                      <div className="flex items-center gap-3 text-coin-yellow">
                        <Camera aria-hidden="true" size={22} />
                        <h2 className="font-black text-screen-white">방 만들기</h2>
                      </div>
                      <label className="mt-4 block text-sm font-black" htmlFor="real-ai-create-nickname">
                        닉네임
                      </label>
                      <input
                        className="arcade-input mt-2"
                        id="real-ai-create-nickname"
                        maxLength={12}
                        minLength={2}
                        onChange={(event) => setCreateNickname(event.target.value)}
                        placeholder="host"
                        value={createNickname}
                      />
                      <button
                        className="arcade-button mt-4 w-full"
                        disabled={connectionStatus !== "connected"}
                        type="submit"
                      >
                        <UserPlus aria-hidden="true" size={18} />
                        방 만들기
                      </button>
                    </form>
                  ) : null}

                  <form
                    className="border border-line-gray bg-console-black p-4"
                    onSubmit={joinRoom}
                  >
                    <div className="flex items-center gap-3 text-pixel-blue">
                      <Ticket aria-hidden="true" size={22} />
                      <h2 className="font-black text-screen-white">방 참가</h2>
                    </div>
                    <label className="mt-4 block text-sm font-black" htmlFor="real-ai-join-nickname">
                      닉네임
                    </label>
                    <input
                      className="arcade-input mt-2"
                      id="real-ai-join-nickname"
                      maxLength={12}
                      minLength={2}
                      onChange={(event) => setJoinNickname(event.target.value)}
                      placeholder="guest"
                      value={joinNickname}
                    />
                    {!isJoinOnly ? (
                      <>
                        <label className="mt-4 block text-sm font-black" htmlFor="real-ai-room-code">
                          방 코드
                        </label>
                        <input
                          className="arcade-input mt-2 font-arcade text-lg"
                          id="real-ai-room-code"
                          maxLength={6}
                          onChange={(event) =>
                            setJoinRoomCode(normalizeRoomCode(event.target.value))
                          }
                          placeholder="ABC123"
                          value={joinRoomCode}
                        />
                      </>
                    ) : (
                      <div className="mt-4 border border-line-gray bg-panel-gray p-3">
                        <p className="text-xs font-bold text-muted-gray">방 코드</p>
                        <p className="mt-1 font-arcade text-xl text-screen-white">
                          {joinRoomCode || "미입력"}
                        </p>
                      </div>
                    )}
                    <button
                      className="arcade-button arcade-button-secondary mt-4 w-full"
                      disabled={connectionStatus !== "connected" || joinRoomCode.length !== 6}
                      type="submit"
                    >
                      <Users aria-hidden="true" size={18} />
                      입장하기
                    </button>
                  </form>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="border border-line-gray bg-console-black p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-arcade text-xs text-electric-cyan">대기실</p>
                        <h2 className="mt-1 text-2xl font-black text-screen-white">
                          {roomStatusLabel(room.status)}
                        </h2>
                      </div>
                      <div className="arcade-badge">
                        <Users aria-hidden="true" size={16} />
                        {connectedPlayerCount}/{room.maxPlayers}
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-muted-gray">
                      {roomStatusHelp(room.status)}
                    </p>

                    <div className="mt-5">{renderSettingsSummary}</div>

                    {room.status === "countdown" ? (
                      <div className="mt-5 border border-coin-yellow bg-coin-yellow/15 p-4">
                        <p className="font-arcade text-xs text-coin-yellow">준비 카운트다운</p>
                        <p className="mt-2 text-3xl font-black text-screen-white">
                          {countdown?.remainingSeconds ?? room.settings.countdownSeconds}초
                        </p>
                      </div>
                    ) : null}

                    {room.status === "answering" && activeRound ? (
                      <RealOrAiAnsweringPanel
                        answerCount={answerCount}
                        currentPlayerId={currentPlayerId}
                        isSubmittingAnswer={isSubmittingAnswer}
                        onCandidateSelect={setSelectedCandidateId}
                        onSubmitAnswer={submitAnswer}
                        room={room}
                        round={activeRound}
                        selectedCandidateId={selectedCandidateId}
                        submittedAnswer={submittedAnswer}
                        timer={timer}
                      />
                    ) : null}

                    {roundResult ? (
                      <RealOrAiRoundResultPanel
                        currentPlayerId={currentPlayerId}
                        isAdvancingRound={isAdvancingRound}
                        isHost={isHost}
                        onNextRound={nextRound}
                        result={roundResult}
                      />
                    ) : null}

                    {gameResult ? (
                      <RealOrAiFinalResultPanel
                        currentPlayerId={currentPlayerId}
                        gameResult={gameResult}
                        isHost={isHost}
                        onResetRoom={resetRoom}
                      />
                    ) : null}
                  </section>

                  <aside className="grid gap-4">
                    <section className="border border-line-gray bg-console-black p-4">
                      <div className="flex items-center gap-3 text-coin-yellow">
                        <Crown aria-hidden="true" size={21} />
                        <h2 className="font-black text-screen-white">참가자</h2>
                      </div>
                      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                        {room.players.map((player) => (
                          <div
                            className="flex items-center justify-between gap-3 border border-line-gray bg-panel-gray px-3 py-2"
                            key={player.playerId}
                          >
                            <span className="truncate font-bold">
                              {player.nickname}
                              {player.playerId === currentPlayerId ? " (나)" : ""}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-xs font-black text-muted-gray">
                              {player.playerId === room.hostPlayerId ? (
                                <Crown aria-label="호스트" className="text-coin-yellow" size={14} />
                              ) : null}
                              {player.connectionStatus === "connected" ? "온라인" : "끊김"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="border border-line-gray bg-console-black p-4">
                      <div className="flex items-center gap-3 text-pixel-blue">
                        <Settings2 aria-hidden="true" size={21} />
                        <h2 className="font-black text-screen-white">운영</h2>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="arcade-meter min-h-16 px-2 py-2">
                          <strong>{operationRoundText}</strong>
                          <span>현재 라운드</span>
                        </div>
                        <div className="arcade-meter min-h-16 px-2 py-2">
                          <strong>{operationRemainingSeconds}</strong>
                          <span>남은 시간</span>
                        </div>
                        <div className="arcade-meter min-h-16 px-2 py-2">
                          <strong>
                            {operationSubmittedCount}/{connectedPlayerCount}
                          </strong>
                          <span>제출</span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <button
                          className="arcade-button"
                          disabled={!canStart}
                          onClick={startGame}
                          type="button"
                        >
                          <Play aria-hidden="true" size={18} />
                          게임 시작
                        </button>
                        <button
                          className="arcade-button arcade-button-danger"
                          disabled={!canSkipRound}
                          onClick={skipRound}
                          type="button"
                        >
                          <X aria-hidden="true" size={18} />
                          라운드 스킵
                        </button>
                        <button
                          aria-label="운영 패널 다음 진행"
                          className="arcade-button arcade-button-secondary"
                          disabled={!canAdvanceFromOperations}
                          onClick={nextRound}
                          type="button"
                        >
                          <Maximize2 aria-hidden="true" size={18} />
                          다음 진행
                        </button>
                        <button
                          className="arcade-button arcade-button-secondary"
                          disabled={!isHost}
                          onClick={resetRoom}
                          type="button"
                        >
                          <RotateCcw aria-hidden="true" size={18} />
                          방 리셋
                        </button>
                        <button
                          className="arcade-button arcade-button-ghost"
                          onClick={leaveRoom}
                          type="button"
                        >
                          <LogOut aria-hidden="true" size={18} />
                          나가기
                        </button>
                      </div>
                      <p className="mt-3 text-xs font-bold leading-5 text-muted-gray">
                        설정은 대기 중에만 바꿀 수 있고, 진행 중에는 호스트 운영 버튼만
                        활성화됩니다.
                      </p>
                    </section>
                  </aside>
                </div>
              )}
            </div>

            {room ? (
              <aside className="grid gap-5">
                {isHost && room.status === "waiting" ? (
                  <section className="arcade-panel p-4">
                    <div className="flex items-center gap-3 text-coin-yellow">
                      <Settings2 aria-hidden="true" size={22} />
                      <h2 className="font-black text-screen-white">게임 설정</h2>
                    </div>
                    <div className="mt-5 space-y-5">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <label className="font-black" htmlFor="real-ai-round-count">
                            라운드 수
                          </label>
                          <span className="text-sm text-muted-gray">
                            최대 {room.playableRoundCount}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            aria-label="라운드 줄이기"
                            className="arcade-button arcade-button-ghost h-11 w-11 px-0"
                            disabled={room.settings.roundCount <= 1}
                            onClick={() => changeRoundCount(-1)}
                            type="button"
                          >
                            <Minus aria-hidden="true" size={18} />
                          </button>
                          <div
                            className="grid h-11 min-w-24 place-items-center border border-line-gray bg-console-black font-arcade text-xl"
                            id="real-ai-round-count"
                          >
                            {room.settings.roundCount}
                          </div>
                          <button
                            aria-label="라운드 늘리기"
                            className="arcade-button arcade-button-ghost h-11 w-11 px-0"
                            disabled={room.settings.roundCount >= roundCountMax}
                            onClick={() => changeRoundCount(1)}
                            type="button"
                          >
                            <Plus aria-hidden="true" size={18} />
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="font-black" id="real-ai-round-duration">
                          제한 시간
                        </p>
                        <div
                          aria-labelledby="real-ai-round-duration"
                          className="mt-2 grid gap-3"
                        >
                          {roundDurationGroups.map((group) => (
                            <div
                              className="border border-line-gray bg-console-black/70 p-3"
                              key={group.title}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <strong className="text-sm text-screen-white">
                                  {group.title}
                                </strong>
                                <span className="text-xs font-bold text-muted-gray">
                                  {group.help}
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {group.durations.map((duration) => (
                                  <button
                                    aria-pressed={
                                      room.settings.roundDurationSeconds === duration
                                    }
                                    className={
                                      room.settings.roundDurationSeconds === duration
                                        ? "arcade-button"
                                        : "arcade-button arcade-button-ghost"
                                    }
                                    key={duration}
                                    onClick={() =>
                                      updateSettings({
                                        ...room.settings,
                                        roundDurationSeconds:
                                          parseRoundDuration(String(duration)) ??
                                          room.settings.roundDurationSeconds,
                                      })
                                    }
                                    type="button"
                                  >
                                    <Timer aria-hidden="true" size={16} />
                                    {duration}초
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="font-black" htmlFor="real-ai-countdown">
                          준비 시간
                        </label>
                        <div className="mt-2 grid grid-cols-3 gap-2" id="real-ai-countdown">
                          {REAL_OR_AI_COUNTDOWN_SECONDS_OPTIONS.map((seconds) => (
                            <button
                              aria-pressed={room.settings.countdownSeconds === seconds}
                              className={
                                room.settings.countdownSeconds === seconds
                                  ? "arcade-button"
                                  : "arcade-button arcade-button-ghost"
                              }
                              key={seconds}
                              onClick={() =>
                                updateSettings({
                                  ...room.settings,
                                  countdownSeconds:
                                    parseCountdownSeconds(String(seconds)) ??
                                    room.settings.countdownSeconds,
                                })
                              }
                              type="button"
                            >
                              {seconds}초
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="arcade-panel p-4">
                    <div className="flex items-center gap-3 text-electric-cyan">
                      <Settings2 aria-hidden="true" size={22} />
                      <h2 className="font-black text-screen-white">설정 요약</h2>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-gray">
                      {isHost
                        ? "진행 중에는 설정을 바꿀 수 없습니다."
                        : "호스트가 시작 전 설정을 조정합니다."}
                    </p>
                    <div className="mt-4">{renderSettingsSummary}</div>
                  </section>
                )}

                {isHost ? (
                  <section className="arcade-panel p-4">
                    <button
                      aria-expanded={isQrPanelOpen}
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={() => setIsQrPanelOpen((value) => !value)}
                      type="button"
                    >
                      <span className="flex items-center gap-3 font-black text-screen-white">
                        <QrCode aria-hidden="true" className="text-coin-yellow" size={22} />
                        QR 입장
                      </span>
                      {isQrPanelOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {isQrPanelOpen ? (
                      <div className="mt-4 border border-line-gray bg-console-black p-4">
                        <p className="text-sm font-bold text-muted-gray">참가 링크</p>
                        <p className="mt-2 break-all text-sm font-bold text-screen-white">
                          {joinUrl}
                        </p>
                        <div className="mt-4 grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                          <div className="grid aspect-square place-items-center border border-line-gray bg-screen-white p-2">
                            {qrDataUrl ? (
                              <div
                                aria-label={`${room.roomCode} 방 참가 QR`}
                                className="h-full w-full bg-contain bg-center bg-no-repeat"
                                style={{ backgroundImage: `url("${qrDataUrl}")` }}
                              />
                            ) : (
                              <span className="text-xs font-black text-console-black">
                                QR
                              </span>
                            )}
                          </div>
                          <div className="grid content-center gap-2">
                            <button
                              className="arcade-button arcade-button-secondary"
                              disabled={!joinUrl}
                              onClick={copyJoinUrl}
                              type="button"
                            >
                              <Clipboard aria-hidden="true" size={16} />
                              링크 복사
                            </button>
                            <button
                              className="arcade-button arcade-button-ghost"
                              disabled={!qrDataUrl}
                              onClick={openQrModal}
                              ref={qrModalTriggerRef}
                              type="button"
                            >
                              <Maximize2 aria-hidden="true" size={16} />
                              크게 보기
                            </button>
                          </div>
                        </div>
                        {copyNotice ? (
                          <p className="mt-3 text-sm font-bold text-health-green">
                            {copyNotice}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </aside>
            ) : (
              <aside className="arcade-panel p-4">
                <div className="flex items-center gap-3 text-coin-yellow">
                  <Trophy aria-hidden="true" size={22} />
                  <h2 className="font-black text-screen-white">진행 방식</h2>
                </div>
                <div className="mt-5 grid gap-3">
                  {[
                    "방장이 라운드 수와 제한 시간을 설정합니다.",
                    "각 라운드는 실제 사진 1장과 AI 생성 사진 1장으로 구성됩니다.",
                    "정답과 이미지 출처는 라운드 결과 때만 공개됩니다.",
                  ].map((text) => (
                    <p
                      className="border border-line-gray bg-console-black p-3 text-sm font-bold leading-6 text-muted-gray"
                      key={text}
                    >
                      {text}
                    </p>
                  ))}
                </div>
              </aside>
            )}
          </section>
        </div>
      </div>

      {isQrModalOpen && isHost && room ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-console-black/85 px-4 py-6"
          role="dialog"
        >
          <section className="arcade-panel max-h-full w-full max-w-md overflow-auto p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-arcade text-xs text-electric-cyan">QR 입장</p>
                <h2 className="mt-2 text-2xl font-black text-coin-yellow">
                  방 코드 <span className="font-arcade">{room.roomCode}</span>
                </h2>
              </div>
              <button
                aria-label="QR 모달 닫기"
                className="arcade-button arcade-button-ghost h-10 w-10 px-0"
                onClick={closeQrModal}
                ref={qrModalCloseButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="mt-5 grid place-items-center border border-line-gray bg-screen-white p-4">
              {qrDataUrl ? (
                <div
                  aria-label={`${room.roomCode} 방 참가 QR 크게 보기`}
                  className="aspect-square w-full max-w-72 bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${qrDataUrl}")` }}
                />
              ) : null}
            </div>
            <p className="mt-4 break-all text-sm font-bold leading-6 text-screen-white">
              {joinUrl}
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
