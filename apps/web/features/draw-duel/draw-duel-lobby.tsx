"use client";

import type {
  ClientToServerEvents,
  DrawDuelAIThinkingPayload,
  DrawDuelGameResultPayload,
  DrawDuelGuessLogPayload,
  DrawDuelResultSlide,
  DrawDuelRoundResultPayload,
  DrawDuelRoundStatePayload,
  DrawDuelSettings,
  DrawDuelRoundDurationSeconds,
  DrawDuelTimerTickPayload,
  DrawDuelWordPayload,
  DrawStrokeHistoryPayload,
  DrawStrokePayload,
  EventResponse,
  RoomJoinedPayload,
  RoomState,
  ServerToClientEvents,
} from "@ai-arcade/shared";
import { createQrSvgDataUrl } from "@ai-arcade/qr-code";
import {
  DRAW_DUEL_GAME_ID,
  DRAW_DUEL_MAX_ROUNDS_MAX,
  DRAW_DUEL_MAX_ROUNDS_MIN,
  DRAW_DUEL_ROUND_DURATION_OPTIONS,
} from "@ai-arcade/shared";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock3,
  Clipboard,
  Crown,
  Maximize2,
  Minus,
  Plus,
  LogOut,
  Play,
  Plug,
  PlugZap,
  QrCode,
  RotateCcw,
  Settings2,
  SkipForward,
  Target,
  Ticket,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { AudioToggle } from "@/components/audio-toggle";
import { AUDIO_VERDICT_CUE_DELAY_MS, type MusicScene } from "@/lib/game-audio";
import { useAudioScene, useGameAudio } from "@/lib/use-game-audio";

import { DrawDuelAnswerPanel } from "./draw-duel-answer-panel";
import { DrawDuelBoard } from "./draw-duel-board";
import {
  getFinalTeamScores,
  getFinalWinner,
  getHumanAnswerRankings,
} from "./draw-duel-final-result";
import { DrawDuelRoundResult } from "./draw-duel-round-result";

type LobbyConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

type StoredRoomSession = {
  playerId: string;
  reconnectToken: string;
  roomCode: string;
};

type PendingDangerAction = "leave" | "reset" | null;

type DrawDuelLobbyProps = {
  entryMode?: "full" | "host-only" | "join-only";
  initialRoomCode?: string;
};

const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";
const reconnectStorageKey = "draw-duel:reconnect";

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

function drawerModeText(mode: DrawDuelSettings["drawerMode"]) {
  return mode === "host-only" ? "호스트 고정" : "순서대로 교대";
}

function roundDurationText(duration: DrawDuelRoundDurationSeconds) {
  return `${duration}초`;
}

function screenJoinCodeVisibilityText(
  visibility: DrawDuelSettings["screenJoinCodeVisibility"],
) {
  return visibility === "always" ? "라운드 중 표시" : "대기 중만 표시";
}

function parseRoundDuration(value: string): DrawDuelRoundDurationSeconds | null {
  const parsed = Number(value);
  const candidate = parsed as DrawDuelRoundDurationSeconds;

  return DRAW_DUEL_ROUND_DURATION_OPTIONS.includes(candidate) ? candidate : null;
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
        roomCode: normalizeRoomCode(parsed.roomCode),
        playerId: parsed.playerId,
        reconnectToken: parsed.reconnectToken,
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

function friendlyErrorMessage(error: { code: string; message: string }) {
  const messages: Record<string, string> = {
    ROOM_NOT_FOUND: "방을 찾을 수 없어요.",
    ROOM_FULL: "방이 가득 찼어요.",
    ROOM_NOT_WAITING: "이미 진행 중인 방이에요.",
    INVALID_ROOM_CODE: "방 코드는 영문과 숫자 6자리로 입력해 주세요.",
    INVALID_ROOM_JOIN: "방 코드와 닉네임을 확인해 주세요.",
    REJOIN_FAILED: "재접속에 실패했어요. 방 코드로 다시 입장해 주세요.",
    INVALID_ROOM_REJOIN: "재접속 정보가 맞지 않아요.",
    HOST_ONLY: "호스트만 사용할 수 있어요.",
    INVALID_SETTINGS: "설정 값을 확인해 주세요.",
    NICKNAME_EXHAUSTED: "같은 닉네임이 너무 많아요. 다른 이름을 입력해 주세요.",
    NOT_ENOUGH_PLAYERS: "2명 이상 모이면 시작할 수 있어요.",
    PLAYER_NOT_IN_ROOM: "방 입장 상태를 다시 확인해 주세요.",
    ROUND_NOT_DRAWING: "지금은 스킵할 수 있는 라운드가 없어요.",
    GAME_NOT_STARTED: "아직 시작된 게임이 없어요.",
    ALREADY_SUBMITTED: "이번 라운드에는 이미 제출했어요.",
  };

  return messages[error.code] ?? error.message;
}

export function DrawDuelLobby({
  entryMode = "full",
  initialRoomCode: initialRoomCodeProp = "",
}: DrawDuelLobbyProps) {
  const { playCue } = useGameAudio();
  const searchParams = useSearchParams();
  const initialRoomCode = normalizeRoomCode(
    initialRoomCodeProp || searchParams.get("roomCode") || "",
  );
  const isJoinOnly = entryMode === "join-only";
  const isHostOnly = entryMode === "host-only";
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const currentPlayerIdRef = useRef<string | null>(null);
  const pendingNicknameRef = useRef<string | null>(null);
  const roundIdRef = useRef<string | null>(null);
  const qrModalCloseButtonRef = useRef<HTMLButtonElement>(null);
  const qrModalTriggerRef = useRef<HTMLButtonElement>(null);
  const previousQrFocusRef = useRef<HTMLElement | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState<LobbyConnectionStatus>("connecting");
  const [createNickname, setCreateNickname] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState(initialRoomCode);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [roundState, setRoundState] = useState<DrawDuelRoundStatePayload | null>(null);
  const [word, setWord] = useState<DrawDuelWordPayload | null>(null);
  const [timer, setTimer] = useState<DrawDuelTimerTickPayload | null>(null);
  const [guessLogs, setGuessLogs] = useState<DrawDuelGuessLogPayload[]>([]);
  const [aiThinkingSteps, setAIThinkingSteps] = useState<DrawDuelAIThinkingPayload[]>([]);
  const [guessText, setGuessText] = useState("");
  const [roundResult, setRoundResult] = useState<DrawDuelRoundResultPayload | null>(null);
  const [resultSlide, setResultSlide] = useState<DrawDuelResultSlide>("ai-answer");
  const [gameResult, setGameResult] = useState<DrawDuelGameResultPayload | null>(null);
  const [strokeHistory, setStrokeHistory] = useState<DrawStrokeHistoryPayload | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [playUrl, setPlayUrl] = useState("");
  const [screenUrl, setScreenUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [isQrPanelOpen, setIsQrPanelOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isMobileOperationsOpen, setIsMobileOperationsOpen] = useState(false);
  const [pendingDangerAction, setPendingDangerAction] =
    useState<PendingDangerAction>(null);

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
    currentPlayerIdRef.current = currentPlayerId;
  }, [currentPlayerId]);

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
      setPlayUrl("");
      setScreenUrl("");
      setAdminUrl("");
      setQrDataUrl(null);
      return;
    }

    setJoinUrl(`${window.location.origin}/join/${room.roomCode}`);
    setPlayUrl(`${window.location.origin}/play/${room.roomCode}`);
    setScreenUrl(`${window.location.origin}/screen/${room.roomCode}`);
    setAdminUrl(`${window.location.origin}/admin/${room.roomCode}`);
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

  function resetGameState() {
    roundIdRef.current = null;
    setRoundState(null);
    setWord(null);
    setTimer(null);
    setGuessLogs([]);
    setAIThinkingSteps([]);
    setGuessText("");
    setRoundResult(null);
    setResultSlide("ai-answer");
    setGameResult(null);
    setStrokeHistory(null);
  }

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(realtimeUrl);
    socketRef.current = socket;

    function attemptStoredRejoin() {
      const storedSession = loadStoredSession();

      if (!storedSession) {
        setConnectionStatus("connected");
        setErrorMessage(null);
        return;
      }

      if (initialRoomCode && storedSession.roomCode !== initialRoomCode) {
        setConnectionStatus("connected");
        setErrorMessage(null);
        return;
      }

      setConnectionStatus("reconnecting");
      setJoinRoomCode(storedSession.roomCode);
      socket.emit("room:rejoin", storedSession, (response) => {
        if (!response.ok) {
          clearStoredSession();
          setRoom(null);
          setCurrentPlayerId(null);
          resetGameState();
          setConnectionStatus(socket.connected ? "connected" : "error");
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        applyJoined(response.data);
        setConnectionStatus("connected");
        setNoticeMessage("방에 다시 연결됐습니다.");
      });
    }

    socket.on("connect", () => {
      attemptStoredRejoin();
    });

    socket.on("disconnect", (reason) => {
      setConnectionStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });

    socket.on("connect_error", () => {
      playCue("ui_error");
      setConnectionStatus("error");
      setErrorMessage("게임 서버 연결을 확인해 주세요.");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.io.on("reconnect_failed", () => {
      playCue("ui_error");
      setConnectionStatus("error");
      setErrorMessage("재접속에 실패했습니다.");
    });

    socket.on("room:state", (payload) => {
      setRoom(payload.room);

      if (payload.room.status === "waiting") {
        resetGameState();
      }
    });

    socket.on("game:start", (payload) => {
      playCue("game_start", { key: `draw-duel:game-start:${payload.roomCode}` });
      setNoticeMessage(payload.message);
    });

    socket.on("draw-duel:round-state", (payload) => {
      if (roundIdRef.current !== payload.round.roundId) {
        if (roundIdRef.current) {
          setStrokeHistory({ roomCode: payload.roomCode, strokes: [] });
        }

        roundIdRef.current = payload.round.roundId;
        setWord(null);
        setTimer(null);
        setGuessLogs([]);
        setAIThinkingSteps([]);
        setRoundResult(null);
        setResultSlide("ai-answer");
        setGameResult(null);
        setGuessText("");
        playCue("round_start", {
          key: `draw-duel:round-start:${payload.round.roundId}`,
        });
      }

      if (payload.round.status !== "drawing") {
        setWord(null);
      }

      if (payload.round.status === "ai-guessing") {
        playCue("ai_thinking", {
          key: `draw-duel:ai-thinking:${payload.round.roundId}`,
        });
      }

      setRoundState(payload);
    });

    socket.on("draw-duel:word", (payload) => {
      if (payload.drawerPlayerId === currentPlayerIdRef.current) {
        setWord(payload);
      }
    });

    socket.on("draw-duel:timer-tick", (payload) => {
      if (payload.remainingSeconds > 0 && payload.remainingSeconds <= 3) {
        playCue("countdown_tick", {
          key: `draw-duel:timer:${payload.roundId}:${payload.remainingSeconds}`,
        });
      }

      if (payload.remainingSeconds === 0) {
        playCue("countdown_go", {
          key: `draw-duel:timer-go:${payload.roundId}`,
        });
      }

      setTimer(payload);
    });

    socket.on("draw-duel:stroke-history", (payload) => {
      setStrokeHistory(payload);
    });

    socket.on("draw-duel:canvas-clear", (payload) => {
      setStrokeHistory({ roomCode: payload.roomCode, strokes: [] });
    });

    function appendGuessLog(payload: DrawDuelGuessLogPayload) {
      setGuessLogs((current) => {
        if (current.some((guess) => guess.guessId === payload.guessId)) {
          return current;
        }

        return [...current, payload];
      });
    }

    socket.on("draw-duel:guess-log", appendGuessLog);

    socket.on("draw-duel:ai-thinking", (payload) => {
      if (roundIdRef.current && roundIdRef.current !== payload.roundId) {
        return;
      }

      playCue("ai_thinking", {
        key: `draw-duel:ai-thinking-step:${payload.roundId}:${payload.stepIndex}`,
      });

      setAIThinkingSteps((current) => {
        const currentRoundSteps = current.filter(
          (step) => step.roundId === payload.roundId,
        );

        return [...currentRoundSteps, payload].slice(-6);
      });
    });

    socket.on("draw-duel:ai-guess", (payload) => {
      appendGuessLog(payload);
    });

    socket.on("draw-duel:round-result", (payload) => {
      playCue("round_result", {
        key: `draw-duel:round-result:${payload.roundId}`,
      });

      const playerGuess = payload.guesses.find(
        (guess) =>
          guess.source === "player" &&
          guess.playerId === currentPlayerIdRef.current,
      );

      if (playerGuess) {
        playCue(playerGuess.isCorrect ? "correct" : "wrong", {
          delayMs: AUDIO_VERDICT_CUE_DELAY_MS,
          key: `draw-duel:verdict:${payload.roundId}:${playerGuess.playerId}`,
        });
      }

      setRoundResult(payload);
      setResultSlide("ai-answer");
      setGuessLogs(payload.guesses);
      setAIThinkingSteps([]);
    });

    socket.on("draw-duel:result-slide-set", (payload) => {
      if (roundIdRef.current === payload.roundId) {
        playCue(payload.slide === "showdown" ? "score_reveal" : "answer_reveal", {
          key: `draw-duel:result-slide:${payload.roundId}:${payload.slide}`,
        });
        setResultSlide(payload.slide);
      }
    });

    socket.on("draw-duel:game-result", (payload) => {
      playCue("final_result", {
        key: `draw-duel:final-result:${payload.roomCode}:${payload.endedAt}`,
      });
      setGameResult(payload);
      setRoundResult(null);
      setResultSlide("ai-answer");
      setAIThinkingSteps([]);
      setNoticeMessage("게임이 종료됐습니다.");
    });

    socket.on("error", (payload) => {
      playCue("ui_error");
      setErrorMessage(friendlyErrorMessage(payload));
    });

    return () => {
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
    };
    // Socket lifecycle is bound to the initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.playerId === currentPlayerId),
    [currentPlayerId, room],
  );
  const currentRound = roundState?.round ?? null;
  const isPlayingView = Boolean(room?.status === "playing" && !gameResult);
  const hasJoinRoomCode = joinRoomCode.length === 6;
  const isAIGuessing = currentRound?.status === "ai-guessing" && !roundResult;
  const visibleAIThinkingSteps = aiThinkingSteps.slice(-3);
  const initialBoardStrokes: DrawStrokePayload[] = useMemo(
    () => {
      if (!strokeHistory || strokeHistory.roomCode !== room?.roomCode) {
        return [];
      }

      return strokeHistory.strokes;
    },
    [room?.roomCode, strokeHistory],
  );
  const drawerPlayer = useMemo(
    () => room?.players.find((player) => player.playerId === currentRound?.drawerPlayerId),
    [currentRound?.drawerPlayerId, room],
  );
  const connectedPlayerCount =
    room?.players.filter((player) => player.connectionStatus === "connected").length ?? 0;
  const isHost = room?.hostPlayerId === currentPlayerId;
  const isMobileCompactRoomView = Boolean(
    isPlayingView || (room?.status === "waiting" && !isHost),
  );
  const isDrawer = currentRound?.drawerPlayerId === currentPlayerId;
  const submittedGuess = useMemo(
    () =>
      currentRound && currentPlayerId
        ? (guessLogs.find(
            (guess) =>
              guess.roundId === currentRound.roundId &&
              guess.playerId === currentPlayerId &&
              guess.source === "player",
          ) ?? null)
        : null,
    [currentPlayerId, currentRound, guessLogs],
  );
  const hasSubmittedGuess = Boolean(submittedGuess);
  const canStart = Boolean(isHost && room?.status === "waiting" && connectedPlayerCount >= room.minPlayers);
  const canGuess = Boolean(
    room?.status === "playing" &&
      currentRound?.status === "drawing" &&
      currentPlayerId &&
      !isDrawer &&
      !hasSubmittedGuess,
  );
  const canDraw = Boolean(
    room?.status === "playing"
      ? isDrawer && currentRound?.status === "drawing"
      : room?.status === "waiting" && isHost,
  );
  const activeSocket = socketRef.current;
  const remainingSeconds =
    timer && timer.roundId === currentRound?.roundId ? timer.remainingSeconds : null;
  const isFinalRound = Boolean(
    roundResult && roundResult.roundNumber >= roundResult.totalRounds,
  );
  const canSkipRound = Boolean(isHost && currentRound?.status === "drawing" && !roundResult);
  const drawStatus = roundResult
    ? "라운드 결과가 공개됐습니다."
    : isAIGuessing
      ? "AI가 정답을 추측하고 있습니다"
      : currentRound
        ? isDrawer
          ? "이번 라운드의 출제자입니다."
          : `${drawerPlayer?.nickname ?? "출제자"}가 그리고 있습니다.`
        : isHost
          ? "호스트 드로잉 권한이 있습니다."
          : "호스트가 그리고 있습니다.";
  const mobileRoundLabel = currentRound
    ? `${currentRound.roundNumber}/${currentRound.totalRounds}`
    : "대기";
  const mobileTimerLabel = remainingSeconds === null ? "--" : `${remainingSeconds}초`;
  const musicScene: MusicScene = !room || room.status === "waiting" ? "lobby" : "muted";

  useAudioScene(musicScene);

  useEffect(() => {
    if (!isHost) {
      setIsQrPanelOpen(false);
      setIsQrModalOpen(false);
    }
  }, [isHost]);

  useEffect(() => {
    setIsMobileOperationsOpen(false);
  }, [currentRound?.roundId, isPlayingView]);

  function applyJoined(payload: RoomJoinedPayload, requestedNickname?: string) {
    saveStoredSession({
      roomCode: payload.room.roomCode,
      playerId: payload.currentPlayerId,
      reconnectToken: payload.reconnectToken,
    });
    setRoom(payload.room);
    setCurrentPlayerId(payload.currentPlayerId);
    const joinedPlayer = payload.room.players.find(
      (player) => player.playerId === payload.currentPlayerId,
    );
    const trimmedNickname = requestedNickname?.trim();
    const wasRenamed =
      Boolean(trimmedNickname) &&
      Boolean(joinedPlayer?.nickname) &&
      joinedPlayer?.nickname !== trimmedNickname;

    setNoticeMessage(
      wasRenamed && joinedPlayer
        ? `같은 닉네임이 있어 ${joinedPlayer.nickname}으로 표시됩니다.`
        : null,
    );
    setErrorMessage(null);
    setCopyNotice(null);
    setIsQrPanelOpen(false);
    setIsQrModalOpen(false);
    setPendingDangerAction(null);
    resetGameState();
  }

  function handleJoined(
    response: EventResponse<RoomJoinedPayload>,
    requestedNickname?: string,
  ) {
    if (!response.ok) {
      playCue("ui_error");
      setErrorMessage(friendlyErrorMessage(response.error));
      return;
    }

    playCue("room_join");
    applyJoined(response.data, requestedNickname);
  }

  function submitCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || connectionStatus !== "connected") {
      playCue("ui_error");
      setErrorMessage("게임 서버 연결을 확인해 주세요.");
      return;
    }

    pendingNicknameRef.current = createNickname.trim();
    socket.emit(
      "room:create",
      {
        gameId: DRAW_DUEL_GAME_ID,
        nickname: createNickname,
      },
      (response) => handleJoined(response, pendingNicknameRef.current ?? undefined),
    );
  }

  function submitJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || connectionStatus !== "connected") {
      playCue("ui_error");
      setErrorMessage("게임 서버 연결을 확인해 주세요.");
      return;
    }

    pendingNicknameRef.current = joinNickname.trim();
    socket.emit(
      "room:join",
      {
        roomCode: joinRoomCode,
        nickname: joinNickname,
      },
      (response) => handleJoined(response, pendingNicknameRef.current ?? undefined),
    );
  }

  function leaveRoom() {
    const socket = socketRef.current;

    if (!socket || !room) {
      playCue("ui_back");
      clearStoredSession();
      setRoom(null);
      setCurrentPlayerId(null);
      setCopyNotice(null);
      setIsQrPanelOpen(false);
      setIsQrModalOpen(false);
      setPendingDangerAction(null);
      resetGameState();
      return;
    }

    socket.emit("room:leave", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        playCue("ui_error");
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      playCue("ui_back");
      setRoom(null);
      setCurrentPlayerId(null);
      clearStoredSession();
      setNoticeMessage("방에서 나왔습니다.");
      setErrorMessage(null);
      setCopyNotice(null);
      setIsQrPanelOpen(false);
      setIsQrModalOpen(false);
      setPendingDangerAction(null);
      resetGameState();
    });
  }

  function startGame() {
    const socket = socketRef.current;

    if (!socket || !room) {
      return;
    }

    socket.emit("game:start", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        playCue("ui_error");
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      playCue("game_start");
      setNoticeMessage(response.data.message);
      setErrorMessage(null);
    });
  }

  function updateSettings(settings: DrawDuelSettings) {
    const socket = socketRef.current;

    if (!socket || !room || !isHost) {
      return;
    }

    socket.emit(
      "draw-duel:settings-update",
      {
        roomCode: room.roomCode,
        settings,
      },
      (response) => {
        if (!response.ok) {
          playCue("ui_error");
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        playCue("ui_confirm");
        setRoom(response.data.room);
        setNoticeMessage("게임 설정을 저장했습니다.");
        setErrorMessage(null);
      },
    );
  }

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;

    if (!socket || !room || !currentRound || !currentPlayerId || !guessText.trim()) {
      return;
    }

    socket.emit(
      "draw-duel:guess-submit",
      {
        roomCode: room.roomCode,
        roundId: currentRound.roundId,
        playerId: currentPlayerId,
        text: guessText,
      },
      (response) => {
        if (!response.ok) {
          playCue("ui_error");
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        playCue("guess_submit", {
          key: `draw-duel:guess-submit:${response.data.guessId}`,
        });
        setGuessLogs((current) =>
          current.some((guess) => guess.guessId === response.data.guessId)
            ? current
            : [...current, response.data],
        );
        setGuessText("");
        setNoticeMessage("답변을 제출했습니다.");
        setErrorMessage(null);
      },
    );
  }

  function goNextRound() {
    const socket = socketRef.current;

    if (!socket || !room) {
      return;
    }

    socket.emit("draw-duel:next-round", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        playCue("ui_error");
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      playCue("ui_confirm");
      setErrorMessage(null);
    });
  }

  function syncResultSlide(nextSlide: DrawDuelResultSlide) {
    const socket = socketRef.current;

    if (!socket || !room || !roundResult || !isHost) {
      return;
    }

    socket.emit(
      "draw-duel:result-slide-set",
      {
        roomCode: room.roomCode,
        roundId: roundResult.roundId,
        slide: nextSlide,
      },
      (response) => {
        if (!response.ok) {
          playCue("ui_error");
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        playCue(nextSlide === "showdown" ? "score_reveal" : "answer_reveal", {
          key: `draw-duel:result-slide:${roundResult.roundId}:${nextSlide}`,
        });
        setResultSlide(nextSlide);
        setErrorMessage(null);
      },
    );
  }

  function skipRound() {
    const socket = socketRef.current;

    if (!socket || !room || !canSkipRound) {
      return;
    }

    socket.emit("draw-duel:round-skip", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        playCue("ui_error");
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      playCue("ui_confirm");
      setNoticeMessage("라운드를 스킵했습니다.");
      setErrorMessage(null);
    });
  }

  function resetRoom() {
    const socket = socketRef.current;

    if (!socket || !room || !isHost) {
      return;
    }

    socket.emit("draw-duel:room-reset", { roomCode: room.roomCode }, (response) => {
      if (!response.ok) {
        playCue("ui_error");
        setErrorMessage(friendlyErrorMessage(response.error));
        return;
      }

      playCue("ui_back");
      setNoticeMessage("방을 대기 상태로 리셋했습니다.");
      setErrorMessage(null);
      setPendingDangerAction(null);
    });
  }

  function confirmDangerAction() {
    if (pendingDangerAction === "leave") {
      leaveRoom();
      return;
    }

    if (pendingDangerAction === "reset") {
      resetRoom();
    }
  }

  async function copyJoinUrl() {
    if (!joinUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      playCue("ui_error");
      setCopyNotice("참가 링크를 직접 공유해 주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      playCue("copy_link");
      setCopyNotice("참가 링크를 복사했습니다.");
    } catch {
      playCue("ui_error");
      setCopyNotice("참가 링크를 직접 공유해 주세요.");
    }
  }

  function renderRoundSummary() {
    if (!currentRound) {
      return null;
    }

    return (
      <div className="grid gap-3 border border-line-gray bg-console-black p-4 md:grid-cols-3 lg:grid-cols-1">
        <div className="arcade-meter">
          <span>라운드</span>
          <strong>
            {currentRound.roundNumber}/{currentRound.totalRounds}
          </strong>
        </div>
        <div className="arcade-meter">
          <span>출제자</span>
          <strong>{drawerPlayer?.nickname ?? "대기 중"}</strong>
        </div>
        <div className="arcade-meter">
          <span className="flex items-center gap-2">
            <Clock3 aria-hidden="true" size={16} />
            남은 시간
          </span>
          <strong className={remainingSeconds !== null && remainingSeconds <= 10 ? "text-joystick-red" : ""}>
            {remainingSeconds ?? "--"}초
          </strong>
        </div>
      </div>
    );
  }

  function renderResultSlide() {
    if (!roundResult) {
      return null;
    }

    return (
      <DrawDuelRoundResult
        isFinalRound={isFinalRound}
        isHost={isHost}
        onGoNextRound={goNextRound}
        onSyncResultSlide={syncResultSlide}
        resultSlide={resultSlide}
        roundResult={roundResult}
      />
    );
  }

  function renderFinalResult() {
    if (!gameResult) {
      return null;
    }

    const teamScores = getFinalTeamScores(gameResult);
    const finalWinner = getFinalWinner(gameResult);
    const rankings = getHumanAnswerRankings(gameResult);
    const topCorrectCount = rankings[0]?.correctCount ?? 0;
    const topNicknames = rankings
      .filter((entry) => entry.correctCount === topCorrectCount && topCorrectCount > 0)
      .map((entry) => entry.nickname);
    const winnerClass =
      finalWinner === "AI WIN"
        ? "text-pixel-blue"
        : finalWinner === "HUMAN WIN"
          ? "text-health-green"
          : "text-coin-yellow";

    return (
      <div
        className="grid gap-6 border-2 border-coin-yellow bg-console-black p-5 sm:p-7"
        data-testid="draw-duel-final-result"
      >
        <div className="grid gap-5 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center border-2 border-coin-yellow bg-panel-gray text-coin-yellow">
            <Trophy aria-hidden="true" size={34} />
          </div>
          <div>
            <p className="font-arcade text-xs text-electric-cyan">최종 결과</p>
            <h3 className={`mt-3 text-5xl font-black sm:text-7xl ${winnerClass}`}>
              {finalWinner}
            </h3>
          </div>
          <div className="mx-auto grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            <div className="arcade-meter min-h-20">
              <span>AI</span>
              <strong>{teamScores.ai}</strong>
            </div>
            <div className="arcade-meter min-h-20">
              <span>HUMAN</span>
              <strong>{teamScores.human}</strong>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border border-line-gray bg-panel-gray p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-arcade text-xs text-electric-cyan">참가자 랭킹</p>
              <h3 className="mt-2 text-2xl font-black text-screen-white">
                정답 랭킹
              </h3>
            </div>
            <p className="text-sm font-black text-coin-yellow">
              {topCorrectCount > 0
                ? `최다 정답 ${topNicknames.join(", ")} · ${topCorrectCount}개`
                : "최다 정답 없음"}
            </p>
          </div>

          {rankings.length > 0 ? (
            <ol className="grid gap-3">
              {rankings.map((entry) => (
                <li
                  className="flex min-h-16 flex-wrap items-center justify-between gap-3 border border-line-gray bg-console-black px-4 py-3"
                  key={entry.playerId}
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="arcade-badge arcade-badge-yellow">
                      {entry.correctCount > 0
                        ? `${entry.isTied ? "공동 " : ""}${entry.rank}위`
                        : "정답 없음"}
                    </span>
                    <strong className="text-lg text-screen-white">{entry.nickname}</strong>
                  </span>
                  <span className="font-arcade text-xl text-coin-yellow">
                    {entry.correctCount}개
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border border-line-gray bg-console-black p-4 text-sm font-bold text-muted-gray">
              표시할 참가자 랭킹이 없습니다.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderWaitingLobbySummary() {
    if (!room) {
      return null;
    }

    return (
      <div className="grid gap-3 border border-line-gray bg-console-black p-4" data-testid="draw-duel-waiting-lobby">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-arcade text-xs text-health-green">JOINED</p>
            <h3 className="mt-1 text-2xl font-black text-screen-white">입장 완료</h3>
          </div>
          <div className="arcade-badge arcade-badge-yellow min-h-10 px-3">
            방&nbsp;<span className="font-arcade">{room.roomCode}</span>
          </div>
        </div>
        <div className="grid gap-2 text-sm font-bold text-muted-gray">
          <p>
            내 닉네임: <strong className="text-screen-white">{currentPlayer?.nickname}</strong>
          </p>
          <p>호스트가 시작하면 자동으로 게임 화면으로 이동합니다.</p>
          <p>
            설정: {drawerModeText(room.settings.drawerMode)} · {room.settings.maxRounds}R ·{" "}
            {roundDurationText(room.settings.roundDurationSeconds)}
          </p>
        </div>
        <section className="grid gap-2">
          <h4 className="flex items-center justify-between gap-3 text-sm font-black text-screen-white">
            <span>참가자</span>
            <span className="font-arcade text-coin-yellow">{connectedPlayerCount}명</span>
          </h4>
          <ul className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {room.players.map((player) => (
              <li
                className="flex min-h-10 items-center justify-between gap-3 border border-line-gray bg-panel-gray px-3 py-2"
                key={player.playerId}
              >
                <span className="min-w-0 truncate font-black text-screen-white">
                  {player.nickname}
                </span>
                <span
                  className={
                    player.connectionStatus === "connected"
                      ? "arcade-badge arcade-badge-green"
                      : "arcade-badge arcade-badge-red"
                  }
                >
                  {player.connectionStatus === "connected" ? "ON" : "OFF"}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex justify-end">
          <button
            className="arcade-button arcade-button-danger min-h-10 px-3 py-2 text-sm"
            onClick={() => setPendingDangerAction("leave")}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            나가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[100svh] bg-console-black text-screen-white">
      <div className="screen-grid min-h-[100svh] px-3 py-3 sm:px-5 sm:py-8">
        <div className="mx-auto flex min-h-[calc(100svh-1.5rem)] w-full max-w-6xl flex-col sm:min-h-[calc(100svh-4rem)]">
          <div
            className={`flex flex-wrap items-center justify-between gap-4 ${
              isMobileCompactRoomView ? "hidden sm:flex" : ""
            }`}
          >
            <Link className="arcade-button arcade-button-ghost w-fit" href="/">
              <ArrowLeft aria-hidden="true" size={18} />
              허브로
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <AudioToggle />
              <div className="arcade-badge arcade-badge-cyan min-h-11 px-4">
                {connectionStatus === "connected" ? (
                  <PlugZap aria-hidden="true" size={16} />
                ) : (
                  <Plug aria-hidden="true" size={16} />
                )}
                <span className="ml-2">{statusText(connectionStatus)}</span>
              </div>
            </div>
          </div>

          <section
            className={
              room
                ? "grid flex-1 gap-3 py-3 sm:gap-6 sm:py-8"
                : "grid flex-1 gap-6 py-8 lg:grid-cols-[0.95fr_1.05fr]"
            }
          >
            <div className={room ? "hidden" : undefined}>
              <p className="font-arcade text-sm text-electric-cyan">Draw Duel</p>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
                {isHostOnly
                  ? "진행자 방을 만드세요"
                  : isJoinOnly
                    ? "닉네임을 입력하고 참가하세요"
                    : "방을 만들거나 코드로 참가하세요"}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-gray">
                {isHostOnly
                  ? "워크숍 진행자는 여기서 방을 열고 QR, 스크린, 운영 모니터 링크를 공유할 수 있습니다."
                  : isJoinOnly
                    ? "이미 받은 방 코드로 입장합니다. 닉네임만 정하면 바로 참가할 수 있습니다."
                    : "QR로 빠르게 입장하고, 끊긴 참가자는 같은 브라우저에서 60초 안에 복구할 수 있습니다. AI 추측은 서버에서 안전하게 운영됩니다."}
              </p>

              {errorMessage ? (
                <div className="mt-5 border-2 border-joystick-red bg-console-black p-4 text-sm font-bold text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              {noticeMessage ? (
                <div className="mt-5 border-2 border-health-green bg-console-black p-4 text-sm font-bold text-health-green">
                  {noticeMessage}
                </div>
              ) : null}
            </div>

            {room ? (
              <section
                className={
                  isPlayingView
                    ? "grid gap-3 border border-line-gray bg-panel-gray/90 p-3 shadow-panel sm:p-6"
                    : "arcade-panel p-5 sm:p-6"
                }
              >
                <div
                  className={`flex flex-wrap items-start justify-between gap-3 sm:gap-4 ${
                    isMobileCompactRoomView ? "hidden sm:flex" : ""
                  }`}
                >
                  <div>
                    <p className="font-arcade text-xs text-electric-cyan">방 코드</p>
                    <h2 className="mt-1 font-arcade text-2xl text-coin-yellow sm:mt-2 sm:text-5xl">
                      {room.roomCode}
                    </h2>
                    <p className="mt-1 text-sm text-muted-gray sm:mt-3">
                      내 닉네임: <strong className="text-screen-white">{currentPlayer?.nickname}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AudioToggle />
                    <button
                      className="arcade-button arcade-button-danger"
                      onClick={() => setPendingDangerAction("leave")}
                      type="button"
                    >
                      <LogOut aria-hidden="true" size={18} />
                      나가기
                    </button>
                  </div>
                </div>

                {isPlayingView ? (
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-center gap-2 border border-line-gray bg-console-black p-2 text-center text-xs font-black sm:hidden">
                    <div className="grid gap-1">
                      <span className="text-muted-gray">라운드</span>
                      <strong className="font-arcade text-coin-yellow">{mobileRoundLabel}</strong>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-muted-gray">시간</span>
                      <strong className="font-arcade text-electric-cyan">{mobileTimerLabel}</strong>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-muted-gray">역할</span>
                      <strong className={isDrawer ? "text-coin-yellow" : "text-health-green"}>
                        {isDrawer ? "출제" : "정답"}
                      </strong>
                    </div>
                    <button
                      aria-label="나가기"
                      className="arcade-button arcade-button-danger h-10 w-10 p-0"
                      onClick={() => setPendingDangerAction("leave")}
                      title="나가기"
                      type="button"
                    >
                      <LogOut aria-hidden="true" size={16} />
                    </button>
                    <AudioToggle className="h-10 min-h-10 w-10 px-0 [&>span]:hidden" />
                  </div>
                ) : null}

                {gameResult ? (
                  <div className="mt-6">{renderFinalResult()}</div>
                ) : (
                  <>
                    {currentRound && !isPlayingView ? (
                      <div className="mt-3 sm:mt-6 lg:hidden">{renderRoundSummary()}</div>
                    ) : null}

                    <div className="mt-3 grid gap-3 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="grid content-start gap-3 sm:gap-4">
                    {room.status === "waiting" ? (
                      renderWaitingLobbySummary()
                    ) : roundResult ? (
                      renderResultSlide()
                    ) : (
                      <>
                        {isAIGuessing ? (
                          <div className="grid min-h-20 place-items-center border-2 border-pixel-blue bg-console-black p-4 text-center sm:min-h-28 sm:p-5">
                            <div className="grid gap-3">
                              <p className="flex flex-wrap items-center justify-center gap-3 text-lg font-black text-screen-white sm:text-xl">
                                <Bot aria-hidden="true" className="text-electric-cyan" size={24} />
                                AI가 정답을 추측하고 있습니다
                              </p>
                              {visibleAIThinkingSteps.length > 0 ? (
                                <ul
                                  aria-live="polite"
                                  className="grid gap-1 text-sm font-bold leading-6 text-electric-cyan"
                                  data-testid="draw-duel-ai-thinking"
                                >
                                  {visibleAIThinkingSteps.map((step) => (
                                    <li key={`${step.roundId}-${step.stepIndex}-${step.text}`}>
                                      {step.text}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        <DrawDuelBoard
                          canDraw={canDraw}
                          currentPlayerId={currentPlayerId}
                          drawStatus={drawStatus}
                          drawingPrompt={isDrawer ? (word?.word ?? "불러오는 중") : null}
                          compact={isPlayingView}
                          initialStrokes={initialBoardStrokes}
                          room={room}
                          socket={activeSocket}
                          viewerRole={isDrawer ? "drawer" : "guesser"}
                        />
                      </>
                    )}
                  </div>

                  <aside className="grid content-start gap-3 sm:gap-6">
                    {currentRound ? <div className="hidden lg:block">{renderRoundSummary()}</div> : null}

                    {currentRound?.status === "drawing" && !isDrawer ? (
                      <DrawDuelAnswerPanel
                        canGuess={canGuess}
                        guessText={guessText}
                        hasSubmittedGuess={hasSubmittedGuess}
                        onGuessTextChange={setGuessText}
                        onSubmit={submitGuess}
                        submittedGuessText={submittedGuess?.text ?? null}
                      />
                    ) : null}

                    {isHost ? (
                      <div className="grid gap-3 border border-coin-yellow bg-console-black p-3 sm:gap-4 sm:p-4">
                        <button
                          aria-expanded={isMobileOperationsOpen}
                          className={`${
                            isPlayingView ? "flex" : "hidden"
                          } min-h-11 items-center justify-between gap-3 text-left text-lg font-black sm:hidden`}
                          onClick={() => setIsMobileOperationsOpen((current) => !current)}
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            <Crown aria-hidden="true" className="text-coin-yellow" size={20} />
                            운영 패널
                          </span>
                          {isMobileOperationsOpen ? (
                            <ChevronUp aria-hidden="true" size={18} />
                          ) : (
                            <ChevronDown aria-hidden="true" size={18} />
                          )}
                        </button>
                        <h3 className={`${isPlayingView ? "hidden sm:flex" : "flex"} items-center gap-2 text-xl font-black`}>
                          <Crown aria-hidden="true" className="text-coin-yellow" size={22} />
                          운영 패널
                        </h3>
                        <div
                          className={`${
                            isPlayingView && !isMobileOperationsOpen ? "hidden sm:grid" : "grid"
                          } gap-4`}
                        >
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                            <button
                              className="arcade-button arcade-button-secondary"
                              disabled={!canSkipRound}
                              onClick={skipRound}
                              type="button"
                            >
                              <SkipForward aria-hidden="true" size={18} />
                              라운드 스킵
                            </button>
                            <button
                              className="arcade-button arcade-button-danger"
                              onClick={() => setPendingDangerAction("reset")}
                              type="button"
                            >
                              <RotateCcw aria-hidden="true" size={18} />
                              방 리셋
                            </button>
                          </div>

                          <div className="grid gap-3 border border-line-gray bg-panel-gray p-3">
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
                              <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-1">
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
                                  <div className="mt-3 grid gap-2 text-xs font-bold leading-5 text-muted-gray">
                                    <p className="break-all">
                                      플레이 화면 <span className="text-screen-white">{playUrl}</span>
                                    </p>
                                    <p className="break-all">
                                      대형 스크린 <span className="text-screen-white">{screenUrl}</span>
                                    </p>
                                    <p className="break-all">
                                      운영 모니터 <span className="text-screen-white">{adminUrl}</span>
                                    </p>
                                  </div>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
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
                            <p className="text-sm font-bold text-muted-gray">{copyNotice}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {room.status === "waiting" ? (
                      <div
                        className={`grid gap-4 border border-line-gray bg-console-black p-4 ${
                          isHost ? "" : "hidden sm:grid"
                        }`}
                      >
                        <h3 className="flex items-center gap-2 text-xl font-black">
                          <Settings2 aria-hidden="true" className="text-electric-cyan" size={22} />
                          게임 설정
                        </h3>

                        {isHost ? (
                          <>
                            <div className="grid gap-2">
                              <p className="text-sm font-black text-muted-gray">출제자 방식</p>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                                <button
                                  aria-pressed={room.settings.drawerMode === "host-only"}
                                  className={`arcade-button ${
                                    room.settings.drawerMode === "host-only"
                                      ? "arcade-button-primary"
                                      : "arcade-button-ghost"
                                  }`}
                                  onClick={() =>
                                    updateSettings({
                                      ...room.settings,
                                      drawerMode: "host-only",
                                    })
                                  }
                                  type="button"
                                >
                                  <Crown aria-hidden="true" size={18} />
                                  호스트 고정
                                </button>
                                <button
                                  aria-pressed={room.settings.drawerMode === "rotate"}
                                  className={`arcade-button ${
                                    room.settings.drawerMode === "rotate"
                                      ? "arcade-button-secondary"
                                      : "arcade-button-ghost"
                                  }`}
                                  onClick={() =>
                                    updateSettings({
                                      ...room.settings,
                                      drawerMode: "rotate",
                                    })
                                  }
                                  type="button"
                                >
                                  <RotateCcw aria-hidden="true" size={18} />
                                  순서대로 교대
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <p className="text-sm font-black text-muted-gray">최대 라운드</p>
                              <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-2">
                                <button
                                  aria-label="라운드 줄이기"
                                  className="arcade-button arcade-button-ghost h-12 w-12 p-0"
                                  disabled={room.settings.maxRounds <= DRAW_DUEL_MAX_ROUNDS_MIN}
                                  onClick={() =>
                                    updateSettings({
                                      ...room.settings,
                                      maxRounds: Math.max(
                                        DRAW_DUEL_MAX_ROUNDS_MIN,
                                        room.settings.maxRounds - 1,
                                      ),
                                    })
                                  }
                                  type="button"
                                >
                                  <Minus aria-hidden="true" size={18} />
                                </button>
                                <div className="arcade-meter min-h-12 items-center text-center">
                                  <strong>{room.settings.maxRounds}</strong>
                                  <span>라운드</span>
                                </div>
                                <button
                                  aria-label="라운드 늘리기"
                                  className="arcade-button arcade-button-ghost h-12 w-12 p-0"
                                  disabled={room.settings.maxRounds >= DRAW_DUEL_MAX_ROUNDS_MAX}
                                  onClick={() =>
                                    updateSettings({
                                      ...room.settings,
                                      maxRounds: Math.min(
                                        DRAW_DUEL_MAX_ROUNDS_MAX,
                                        room.settings.maxRounds + 1,
                                      ),
                                    })
                                  }
                                  type="button"
                                >
                                  <Plus aria-hidden="true" size={18} />
                                </button>
                              </div>
                            </div>

                            <label className="grid gap-2 text-sm font-black text-muted-gray" htmlFor="round-duration">
                              라운드 시간
                              <select
                                className="arcade-input"
                                id="round-duration"
                                onChange={(event) => {
                                  const duration = parseRoundDuration(event.target.value);

                                  if (duration) {
                                    updateSettings({
                                      ...room.settings,
                                      roundDurationSeconds: duration,
                                    });
                                  }
                                }}
                                value={room.settings.roundDurationSeconds}
                              >
                                {DRAW_DUEL_ROUND_DURATION_OPTIONS.map((duration) => (
                                  <option key={duration} value={duration}>
                                    {roundDurationText(duration)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="grid gap-2">
                              <p className="text-sm font-black text-muted-gray">대형 스크린 참가 코드</p>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                                <button
                                  aria-pressed={room.settings.screenJoinCodeVisibility === "waiting-only"}
                                  className={`arcade-button ${
                                    room.settings.screenJoinCodeVisibility === "waiting-only"
                                      ? "arcade-button-primary"
                                      : "arcade-button-ghost"
                                  }`}
                                  onClick={() =>
                                    updateSettings({
                                      ...room.settings,
                                      screenJoinCodeVisibility: "waiting-only",
                                    })
                                  }
                                  type="button"
                                >
                                  대기 중만 표시
                                </button>
                                <button
                                  aria-pressed={room.settings.screenJoinCodeVisibility === "always"}
                                  className={`arcade-button ${
                                    room.settings.screenJoinCodeVisibility === "always"
                                      ? "arcade-button-secondary"
                                      : "arcade-button-ghost"
                                  }`}
                                  onClick={() =>
                                    updateSettings({
                                      ...room.settings,
                                      screenJoinCodeVisibility: "always",
                                    })
                                  }
                                  type="button"
                                >
                                  라운드 중 표시
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="grid gap-3 border border-line-gray bg-panel-gray p-4">
                            <p className="text-sm font-bold text-muted-gray">
                              호스트가 시작 전 설정을 조정합니다.
                            </p>
                            <dl className="grid gap-2 text-sm">
                              <div className="flex flex-wrap justify-between gap-2">
                                <dt className="text-muted-gray">출제 방식</dt>
                                <dd className="font-black text-screen-white">
                                  {drawerModeText(room.settings.drawerMode)}
                                </dd>
                              </div>
                              <div className="flex flex-wrap justify-between gap-2">
                                <dt className="text-muted-gray">최대 라운드</dt>
                                <dd className="font-black text-screen-white">
                                  {room.settings.maxRounds}라운드
                                </dd>
                              </div>
                              <div className="flex flex-wrap justify-between gap-2">
                                <dt className="text-muted-gray">라운드 시간</dt>
                                <dd className="font-black text-screen-white">
                                  {roundDurationText(room.settings.roundDurationSeconds)}
                                </dd>
                              </div>
                              <div className="flex flex-wrap justify-between gap-2">
                                <dt className="text-muted-gray">스크린 코드</dt>
                                <dd className="font-black text-screen-white">
                                  {screenJoinCodeVisibilityText(room.settings.screenJoinCodeVisibility)}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {currentRound ? (
                      <div className="grid gap-3 border border-line-gray bg-console-black p-4">
                        <h3 className="flex items-center gap-2 text-xl font-black">
                          <Target aria-hidden="true" className="text-coin-yellow" size={22} />
                          라운드
                        </h3>
                        {isAIGuessing ? (
                          <div className="border-2 border-pixel-blue bg-panel-gray p-4">
                            <p className="flex items-center gap-2 font-black text-electric-cyan">
                              <Bot aria-hidden="true" size={18} />
                              AI가 정답을 추측하고 있습니다
                            </p>
                            {visibleAIThinkingSteps.length > 0 ? (
                              <ul
                                aria-live="polite"
                                className="mt-3 grid gap-1 text-sm font-bold leading-6 text-screen-white"
                              >
                                {visibleAIThinkingSteps.map((step) => (
                                  <li key={`${step.roundId}-${step.stepIndex}-${step.text}`}>
                                    {step.text}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : currentRound.status === "drawing" && isDrawer ? (
                          <div className="hidden border-2 border-coin-yellow bg-panel-gray p-4 sm:block">
                            <p className="text-sm font-black text-muted-gray">제시어</p>
                            <p className="mt-2 text-3xl font-black text-coin-yellow" data-testid="draw-duel-word">
                              {word?.word ?? "불러오는 중"}
                            </p>
                          </div>
                        ) : currentRound.status === "drawing" ? (
                          <p className="text-sm leading-6 text-muted-gray">
                            {drawerPlayer?.nickname ?? "출제자"}가 그리고 있습니다.
                          </p>
                        ) : (
                          <p className="text-sm leading-6 text-muted-gray">
                            결과 슬라이드가 진행 중입니다.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`grid gap-3 border border-line-gray bg-console-black p-4 ${
                          isHost ? "" : "hidden sm:grid"
                        }`}
                      >
                        <p className="text-sm leading-6 text-muted-gray">
                          {isHost
                            ? "2명 이상 모이면 게임을 시작할 수 있습니다."
                            : "호스트가 게임을 시작합니다."}
                        </p>
                        {isHost ? (
                          <button
                            className="arcade-button arcade-button-primary"
                            disabled={!canStart}
                            onClick={startGame}
                            type="button"
                          >
                            <Play aria-hidden="true" size={18} />
                            게임 시작
                          </button>
                        ) : null}
                      </div>
                    )}

                  </aside>
                    </div>
                  </>
                )}
              </section>
            ) : isHostOnly ? (
              <section className="grid gap-4">
                <form className="arcade-panel p-5 sm:p-6" onSubmit={submitCreateRoom}>
                  <div className="flex items-center gap-3 text-coin-yellow">
                    <Ticket aria-hidden="true" size={24} />
                    <h2 className="text-2xl font-black text-screen-white">진행자 방 만들기</h2>
                  </div>
                  <label className="mt-5 block text-sm font-black" htmlFor="create-nickname">
                    진행자 닉네임
                  </label>
                  <input
                    className="arcade-input mt-2"
                    id="create-nickname"
                    maxLength={12}
                    minLength={2}
                    onChange={(event) => setCreateNickname(event.target.value)}
                    placeholder="예: 진행자"
                    required
                    value={createNickname}
                  />
                  <button className="arcade-button arcade-button-primary mt-5 w-full" type="submit">
                    <Ticket aria-hidden="true" size={18} />
                    방 만들기
                  </button>
                </form>
              </section>
            ) : isJoinOnly ? (
              <section className="grid gap-4">
                {hasJoinRoomCode ? (
                  <form className="arcade-panel p-5 sm:p-6" onSubmit={submitJoinRoom}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-3 text-pixel-blue">
                        <UserPlus aria-hidden="true" size={24} />
                        <div>
                          <h2 className="text-2xl font-black text-screen-white">방 참가</h2>
                          <p className="mt-2 text-sm text-muted-gray">닉네임만 정하면 바로 입장합니다.</p>
                        </div>
                      </div>
                      <div className="arcade-badge arcade-badge-yellow min-h-12 px-4">
                        방 코드&nbsp;<span className="font-arcade">{joinRoomCode}</span>
                      </div>
                    </div>
                    <label className="mt-5 block text-sm font-black" htmlFor="join-nickname">
                      닉네임
                    </label>
                    <input
                      className="arcade-input mt-2"
                      id="join-nickname"
                      maxLength={12}
                      minLength={2}
                      onChange={(event) => setJoinNickname(event.target.value)}
                      placeholder="예: 빠른손"
                      required
                      value={joinNickname}
                    />
                    <button className="arcade-button arcade-button-secondary mt-5 w-full" type="submit">
                      <UserPlus aria-hidden="true" size={18} />
                      입장하기
                    </button>
                    <Link className="arcade-button arcade-button-ghost mt-3 w-full" href="/">
                      <ArrowLeft aria-hidden="true" size={18} />
                      코드 다시 입력
                    </Link>
                  </form>
                ) : (
                  <div className="arcade-panel grid gap-4 p-5 sm:p-6">
                    <div className="flex items-center gap-3 text-joystick-red">
                      <UserPlus aria-hidden="true" size={24} />
                      <h2 className="text-2xl font-black text-screen-white">방 코드가 필요합니다</h2>
                    </div>
                    <p className="text-sm leading-6 text-muted-gray">
                      참가 링크의 방 코드를 확인하거나 허브에서 코드를 다시 입력해 주세요.
                    </p>
                    <Link className="arcade-button arcade-button-secondary w-full" href="/">
                      <ArrowLeft aria-hidden="true" size={18} />
                      코드 다시 입력
                    </Link>
                  </div>
                )}
              </section>
            ) : (
              <section className="grid gap-4">
                <form className="arcade-panel p-5 sm:p-6" onSubmit={submitCreateRoom}>
                  <div className="flex items-center gap-3 text-coin-yellow">
                    <Ticket aria-hidden="true" size={24} />
                    <h2 className="text-2xl font-black text-screen-white">방 만들기</h2>
                  </div>
                  <label className="mt-5 block text-sm font-black" htmlFor="create-nickname">
                    닉네임
                  </label>
                  <input
                    className="arcade-input mt-2"
                    id="create-nickname"
                    maxLength={12}
                    minLength={2}
                    onChange={(event) => setCreateNickname(event.target.value)}
                    placeholder="예: 픽셀장인"
                    required
                    value={createNickname}
                  />
                  <button className="arcade-button arcade-button-primary mt-5 w-full" type="submit">
                    <Ticket aria-hidden="true" size={18} />
                    방 만들기
                  </button>
                </form>

                <form className="arcade-panel p-5 sm:p-6" onSubmit={submitJoinRoom}>
                  <div className="flex items-center gap-3 text-pixel-blue">
                    <UserPlus aria-hidden="true" size={24} />
                    <h2 className="text-2xl font-black text-screen-white">방 참가</h2>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-black" htmlFor="join-room-code">
                        방 코드
                      </label>
                      <input
                        className="arcade-input mt-2 uppercase"
                        id="join-room-code"
                        maxLength={6}
                        minLength={6}
                        onChange={(event) => setJoinRoomCode(normalizeRoomCode(event.target.value))}
                        placeholder="A1B2C3"
                        required
                        value={joinRoomCode}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black" htmlFor="join-nickname">
                        닉네임
                      </label>
                      <input
                        className="arcade-input mt-2"
                        id="join-nickname"
                        maxLength={12}
                        minLength={2}
                        onChange={(event) => setJoinNickname(event.target.value)}
                        placeholder="예: 빠른손"
                        required
                        value={joinNickname}
                      />
                    </div>
                  </div>
                  <button className="arcade-button arcade-button-secondary mt-5 w-full" type="submit">
                    <UserPlus aria-hidden="true" size={18} />
                    코드로 참가
                  </button>
                </form>
              </section>
            )}
          </section>
        </div>
      </div>

      {pendingDangerAction ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-console-black/85 px-4 py-6"
          role="dialog"
        >
          <div className="arcade-panel grid w-full max-w-md gap-4 border-2 border-joystick-red bg-panel-gray p-5 shadow-panel">
            <div>
              <p className="font-arcade text-xs text-joystick-red">CONFIRM</p>
              <h3 className="mt-2 text-2xl font-black text-screen-white">
                {pendingDangerAction === "leave" ? "방에서 나갈까요?" : "방을 리셋할까요?"}
              </h3>
              <p className="mt-2 text-sm font-bold leading-6 text-muted-gray">
                {pendingDangerAction === "leave"
                  ? "현재 방을 떠납니다. 같은 브라우저라면 다시 입장할 수 있습니다."
                  : "방 코드는 유지하고 진행 상태, 점수, 캔버스, 타이머를 초기화합니다."}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="arcade-button arcade-button-ghost"
                onClick={() => setPendingDangerAction(null)}
                type="button"
              >
                취소
              </button>
              <button
                className="arcade-button arcade-button-danger"
                onClick={confirmDangerAction}
                type="button"
              >
                {pendingDangerAction === "leave" ? "나가기" : "리셋"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isQrModalOpen && isHost && room ? (
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
                <p className="mt-2 text-sm leading-6 text-muted-gray">
                  참가자가 휴대폰 카메라로 스캔하면 이 방으로 바로 들어옵니다.
                </p>
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
                    aria-label={`${room.roomCode} 방 참가 QR 크게 보기`}
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
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="arcade-button arcade-button-primary"
                  onClick={() => void copyJoinUrl()}
                  type="button"
                >
                  <Clipboard aria-hidden="true" size={18} />
                  링크 복사
                </button>
                <button
                  className="arcade-button arcade-button-ghost"
                  onClick={closeQrModal}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
