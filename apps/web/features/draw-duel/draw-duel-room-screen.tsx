"use client";

import type {
  ClientToServerEvents,
  DrawDuelGameResultPayload,
  DrawDuelResultSlide,
  DrawDuelRoundResultPayload,
  DrawDuelRoundStatePayload,
  DrawDuelTimerTickPayload,
  DrawStrokeHistoryPayload,
  DrawStrokePayload,
  RoomState,
  RoomWatchSnapshotPayload,
  ServerToClientEvents,
} from "@ai-arcade/shared";
import { createQrSvgDataUrl } from "@ai-arcade/qr-code";
import {
  Bot,
  Clock3,
  Crown,
  Monitor,
  Plug,
  PlugZap,
  QrCode,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { DrawDuelBoard } from "./draw-duel-board";

type ScreenMode = "admin" | "screen";

type DrawDuelRoomScreenProps = {
  mode: ScreenMode;
  roomCode: string;
};

type WatchConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";
const resultSlideLabels: Record<DrawDuelResultSlide, string> = {
  "ai-answer": "AI 답 공개",
  showdown: "승부 공개",
  "human-answers": "참가자 답변 공개",
};

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
}

function connectionText(status: WatchConnectionStatus) {
  if (status === "connected") {
    return "서버 연결됨";
  }

  if (status === "reconnecting") {
    return "재접속 중";
  }

  if (status === "error") {
    return "연결 오류";
  }

  if (status === "disconnected") {
    return "연결 끊김";
  }

  return "서버 연결 중";
}

function friendlyErrorMessage(error: { code: string; message: string }) {
  const messages: Record<string, string> = {
    INVALID_ROOM_CODE: "방 코드는 영문과 숫자 6자리로 입력해 주세요.",
    ROOM_NOT_FOUND: "방을 찾을 수 없어요. 진행자에게 방 코드를 다시 확인해 주세요.",
  };

  return messages[error.code] ?? error.message;
}

function formatTimer(timer: DrawDuelTimerTickPayload | null) {
  if (!timer) {
    return "--";
  }

  return `${timer.remainingSeconds}초`;
}

function getAIGuess(roundResult: DrawDuelRoundResultPayload | null) {
  return roundResult?.guesses.find((guess) => guess.source === "ai") ?? null;
}

function getHumanGuessCount(roundResult: DrawDuelRoundResultPayload | null) {
  return roundResult?.guesses.filter((guess) => guess.source === "player").length ?? 0;
}

function sortScores(
  roundState: DrawDuelRoundStatePayload | null,
  roundResult: DrawDuelRoundResultPayload | null,
  gameResult: DrawDuelGameResultPayload | null,
) {
  const scores = roundResult?.scores ?? roundState?.scores ?? gameResult?.results ?? [];

  return [...scores].sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    return first.nickname.localeCompare(second.nickname, "ko-KR");
  });
}

function getDrawStatus(room: RoomState, roundState: DrawDuelRoundStatePayload | null) {
  const round = roundState?.round;

  if (!round) {
    return room.status === "waiting"
      ? "참가자를 기다리는 중입니다."
      : "라운드 상태를 불러오는 중입니다.";
  }

  const drawer = room.players.find((player) => player.playerId === round.drawerPlayerId);

  if (round.status === "ai-guessing") {
    return "AI가 그림을 보고 정답을 추측하고 있습니다.";
  }

  if (round.status === "result") {
    return "결과가 대형 스크린에 공개되고 있습니다.";
  }

  return `${drawer?.nickname ?? "출제자"}가 그리고 있습니다.`;
}

export function DrawDuelRoomScreen({ mode, roomCode }: DrawDuelRoomScreenProps) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const roundIdRef = useRef<string | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState<WatchConnectionStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [roundState, setRoundState] = useState<DrawDuelRoundStatePayload | null>(null);
  const [timer, setTimer] = useState<DrawDuelTimerTickPayload | null>(null);
  const [strokeHistory, setStrokeHistory] = useState<DrawStrokeHistoryPayload | null>(null);
  const [roundResult, setRoundResult] = useState<DrawDuelRoundResultPayload | null>(null);
  const [resultSlide, setResultSlide] = useState<DrawDuelResultSlide>("ai-answer");
  const [gameResult, setGameResult] = useState<DrawDuelGameResultPayload | null>(null);
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setJoinUrl(`${window.location.origin}/join/${normalizedRoomCode}`);
  }, [normalizedRoomCode]);

  const qrDataUrl = useMemo(() => {
    if (!joinUrl) {
      return null;
    }

    try {
      return createQrSvgDataUrl(joinUrl, {
        backgroundColor: "#f8fafc",
        foregroundColor: "#0b1020",
        quietZone: 4,
      });
    } catch {
      return null;
    }
  }, [joinUrl]);

  function resetRoundState() {
    roundIdRef.current = null;
    setRoundState(null);
    setTimer(null);
    setStrokeHistory(null);
    setRoundResult(null);
    setResultSlide("ai-answer");
    setGameResult(null);
  }

  function applySnapshot(snapshot: RoomWatchSnapshotPayload) {
    setRoom(snapshot.room);
    setStrokeHistory(snapshot.strokeHistory);
    setRoundState(snapshot.roundState ?? null);
    setTimer(snapshot.timer ?? null);
    setRoundResult(snapshot.roundResult ?? null);
    setResultSlide(snapshot.resultSlide?.slide ?? "ai-answer");
    setGameResult(snapshot.gameResult ?? null);
    setErrorMessage(null);
    roundIdRef.current = snapshot.roundState?.round.roundId ?? null;
  }

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(realtimeUrl);
    socketRef.current = socket;

    function watchRoom() {
      if (normalizedRoomCode.length !== 6) {
        setConnectionStatus("error");
        setErrorMessage("방 코드는 영문과 숫자 6자리로 입력해 주세요.");
        return;
      }

      setConnectionStatus("connected");
      socket.emit("room:watch", { roomCode: normalizedRoomCode }, (response) => {
        if (!response.ok) {
          setConnectionStatus("error");
          setErrorMessage(friendlyErrorMessage(response.error));
          return;
        }

        applySnapshot(response.data);
      });
    }

    socket.on("connect", watchRoom);

    socket.on("disconnect", (reason) => {
      setConnectionStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("error");
      setErrorMessage("서버 연결이 지연되고 있어요. 네트워크와 realtime URL을 확인해 주세요.");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });

    socket.io.on("reconnect_failed", () => {
      setConnectionStatus("error");
      setErrorMessage("재접속에 실패했습니다. 네트워크를 확인해 주세요.");
    });

    socket.on("room:state", (payload) => {
      setRoom(payload.room);

      if (payload.room.status === "waiting") {
        resetRoundState();
      }
    });

    socket.on("draw-duel:round-state", (payload) => {
      if (roundIdRef.current !== payload.round.roundId) {
        roundIdRef.current = payload.round.roundId;
        setRoundResult(null);
        setResultSlide("ai-answer");
        setGameResult(null);
      }

      setRoundState(payload);

      if (payload.round.status === "drawing") {
        setRoundResult(null);
      }
    });

    socket.on("draw-duel:timer-tick", (payload) => {
      setTimer(payload);
    });

    socket.on("draw-duel:stroke-history", (payload) => {
      setStrokeHistory(payload);
    });

    socket.on("draw-duel:round-result", (payload) => {
      setRoundResult(payload);
      setResultSlide("ai-answer");
    });

    socket.on("draw-duel:result-slide-set", (payload) => {
      if (!roundIdRef.current || roundIdRef.current === payload.roundId) {
        setResultSlide(payload.slide);
      }
    });

    socket.on("draw-duel:game-result", (payload) => {
      setGameResult(payload);
      setRoundResult(null);
      setResultSlide("ai-answer");
    });

    socket.on("error", (payload) => {
      setErrorMessage(friendlyErrorMessage(payload));
    });

    return () => {
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [normalizedRoomCode]);

  const currentRound = roundState?.round ?? null;
  const connectedPlayers =
    room?.players.filter((player) => player.connectionStatus === "connected") ?? [];
  const drawerPlayer = room?.players.find(
    (player) => player.playerId === currentRound?.drawerPlayerId,
  );
  const initialBoardStrokes: DrawStrokePayload[] = useMemo(() => {
    if (!strokeHistory || strokeHistory.roomCode !== room?.roomCode) {
      return [];
    }

    return strokeHistory.strokes;
  }, [room?.roomCode, strokeHistory]);
  const scores = sortScores(roundState, roundResult, gameResult);
  const aiGuess = getAIGuess(roundResult);
  const humanGuessCount = getHumanGuessCount(roundResult);
  const answerState = roundResult
    ? `정답 공개: ${roundResult.correctWord}`
    : currentRound?.status === "ai-guessing"
      ? "AI 추측 중"
      : "정답 비공개";
  const screenTitle = mode === "screen" ? "대형 스크린" : "운영 모니터";
  const screenIcon = mode === "screen" ? Monitor : ShieldCheck;
  const ScreenIcon = screenIcon;
  const isConnectionDelayError =
    connectionStatus === "error" && errorMessage?.includes("서버 연결") === true;
  const shouldShowHeaderRoomCode =
    !room ||
    mode === "admin" ||
    room.status === "waiting" ||
    room.settings.screenJoinCodeVisibility === "always";

  return (
    <main className="min-h-[100svh] bg-console-black text-screen-white">
      <div className="screen-grid min-h-[100svh] px-3 py-3 sm:px-6 sm:py-6">
        <div className="mx-auto grid min-h-[calc(100svh-1.5rem)] w-full max-w-7xl content-start gap-4 sm:min-h-[calc(100svh-3rem)] sm:gap-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-gray/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center border-2 border-coin-yellow bg-panel-gray text-coin-yellow">
                <ScreenIcon aria-hidden="true" size={26} />
              </div>
              <div>
                <p className="font-arcade text-xs text-electric-cyan">Draw Duel</p>
                <h1 className="mt-1 text-2xl font-black sm:text-4xl">{screenTitle}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {shouldShowHeaderRoomCode ? (
                <span className="arcade-badge arcade-badge-yellow min-h-11 px-4">
                  방 코드 <span className="ml-2 font-arcade">{normalizedRoomCode}</span>
                </span>
              ) : null}
              <span className="arcade-badge arcade-badge-cyan min-h-11 px-4">
                {connectionStatus === "connected" ? (
                  <PlugZap aria-hidden="true" size={16} />
                ) : (
                  <Plug aria-hidden="true" size={16} />
                )}
                <span className="ml-2">{connectionText(connectionStatus)}</span>
              </span>
            </div>
          </header>

          {errorMessage ? (
            <section className="grid gap-4 border-2 border-joystick-red bg-console-black p-5">
              <h2 className="text-2xl font-black text-red-200">{errorMessage}</h2>
              <p className="text-sm font-bold leading-6 text-muted-gray">
                {isConnectionDelayError
                  ? "네트워크가 느리면 몇 초 정도 걸릴 수 있습니다."
                  : "진행자가 만든 방 코드인지 확인한 뒤 다시 열어 주세요."}
              </p>
              {isConnectionDelayError ? (
                <p className="text-sm font-bold leading-6 text-muted-gray">
                  계속 실패하면 진행자에게 realtime 서버 상태를 확인해 달라고 알려 주세요.
                </p>
              ) : null}
              <Link className="arcade-button arcade-button-secondary w-fit" href="/host">
                진행자 화면으로
              </Link>
            </section>
          ) : null}

          {!room && !errorMessage ? (
            <section className="grid min-h-[60svh] place-items-center text-center">
              <div className="grid gap-3">
                <p className="font-arcade text-sm text-electric-cyan">CONNECTING</p>
                <h2 className="text-3xl font-black">방 상태를 불러오는 중입니다</h2>
                <p className="text-sm font-bold text-muted-gray">
                  네트워크가 느리면 몇 초 정도 걸릴 수 있습니다.
                </p>
              </div>
            </section>
          ) : null}

          {room ? (
            <>
              <section
                className="grid gap-3 border border-line-gray bg-panel-gray/90 p-3 shadow-panel sm:grid-cols-4 sm:p-4"
                data-testid="draw-duel-screen-round"
              >
                <div className="arcade-meter min-h-20">
                  <span>상태</span>
                  <strong>{room.status === "waiting" ? "대기" : room.status === "ended" ? "종료" : "진행"}</strong>
                </div>
                <div className="arcade-meter min-h-20">
                  <span>라운드</span>
                  <strong>
                    {currentRound
                      ? `${currentRound.roundNumber}/${currentRound.totalRounds}`
                      : "대기"}
                  </strong>
                </div>
                <div className="arcade-meter min-h-20">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 aria-hidden="true" size={16} />
                    남은 시간
                  </span>
                  <strong>{formatTimer(timer)}</strong>
                </div>
                <div className="arcade-meter min-h-20" data-testid="draw-duel-screen-answer">
                  <span>정답 공개</span>
                  <strong className={roundResult ? "text-coin-yellow" : "text-muted-gray"}>
                    {answerState}
                  </strong>
                </div>
              </section>

              {mode === "admin" ? (
                <section className="grid gap-3 border border-line-gray bg-console-black p-4 sm:grid-cols-4">
                  <Link className="arcade-button arcade-button-primary" href="/host">
                    진행자 콘솔
                  </Link>
                  <Link className="arcade-button arcade-button-secondary" href={`/join/${room.roomCode}`}>
                    참가 링크
                  </Link>
                  <Link className="arcade-button arcade-button-ghost" href={`/screen/${room.roomCode}`}>
                    대형 스크린
                  </Link>
                  <Link className="arcade-button arcade-button-ghost" href={`/play/${room.roomCode}`}>
                    플레이 화면
                  </Link>
                </section>
              ) : null}

              {room.status === "waiting" ? (
                <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid gap-4">
                    <div className="grid place-items-center border-2 border-coin-yellow bg-console-black p-5 text-center">
                      <div className="grid gap-4">
                        <p className="font-arcade text-sm text-electric-cyan">JOIN NOW</p>
                        <h2 className="font-arcade text-5xl text-coin-yellow sm:text-7xl">
                          {room.roomCode}
                        </h2>
                        <p className="text-xl font-black text-screen-white">
                          휴대폰으로 QR을 찍거나 방 코드를 입력하세요
                        </p>
                        <p className="break-all text-sm font-bold text-muted-gray">{joinUrl}</p>
                      </div>
                    </div>
                    <section
                      className="grid gap-3 border border-line-gray bg-console-black p-4"
                      data-testid="draw-duel-screen-participants"
                    >
                      <h2 className="flex items-center gap-2 text-xl font-black">
                        <Users aria-hidden="true" className="text-electric-cyan" size={22} />
                        참가자 {connectedPlayers.length}명
                      </h2>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {room.players.map((player) => (
                          <li
                            className="flex min-h-11 items-center justify-between gap-3 border border-line-gray bg-panel-gray px-3 py-2"
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
                  </div>
                  <div className="grid place-items-center border-2 border-screen-white bg-screen-white p-4">
                    {qrDataUrl ? (
                      <span
                        aria-label={`${room.roomCode} 방 참가 QR`}
                        className="aspect-square w-full"
                        role="img"
                        style={{
                          backgroundImage: `url("${qrDataUrl}")`,
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "contain",
                        }}
                      />
                    ) : (
                      <QrCode aria-hidden="true" className="text-console-black" size={120} />
                    )}
                  </div>
                </section>
              ) : (
                <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                  <div className="grid content-start gap-4">
                    {gameResult ? (
                      <div className="grid min-h-[520px] place-items-center border-2 border-coin-yellow bg-console-black p-5 text-center">
                        <div className="grid gap-5">
                          <Trophy aria-hidden="true" className="mx-auto text-coin-yellow" size={72} />
                          <p className="font-arcade text-sm text-electric-cyan">FINAL</p>
                          <h2 className="text-5xl font-black text-coin-yellow sm:text-7xl">
                            최종 결과
                          </h2>
                          <p className="text-xl font-black text-screen-white">
                            총 {gameResult.rounds.length}라운드가 종료됐습니다.
                          </p>
                        </div>
                      </div>
                    ) : roundResult ? (
                      <div className="grid min-h-[520px] place-items-center border-2 border-coin-yellow bg-console-black p-5 text-center">
                        <div className="grid gap-5">
                          <p className="font-arcade text-sm text-electric-cyan">
                            {resultSlideLabels[resultSlide]}
                          </p>
                          <h2 className="text-5xl font-black text-coin-yellow sm:text-7xl">
                            {resultSlide === "ai-answer"
                              ? (aiGuess?.text ?? "모르겠음")
                              : resultSlide === "showdown"
                                ? roundResult.teamResult.winner
                                : `${humanGuessCount}명 제출`}
                          </h2>
                          <p className="text-2xl font-black text-screen-white">
                            정답: <span className="text-coin-yellow">{roundResult.correctWord}</span>
                          </p>
                          <p className="text-lg font-bold text-muted-gray">
                            HUMAN {roundResult.teamResult.cumulativeTeamScores.human} · AI{" "}
                            {roundResult.teamResult.cumulativeTeamScores.ai}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <DrawDuelBoard
                        canDraw={false}
                        compact
                        currentPlayerId={null}
                        drawStatus={getDrawStatus(room, roundState)}
                        initialStrokes={initialBoardStrokes}
                        room={room}
                        socket={socketRef.current}
                        viewerRole="watcher"
                      />
                    )}
                  </div>

                  <aside className="grid content-start gap-4">
                    <section
                      className="grid gap-3 border border-line-gray bg-console-black p-4"
                      data-testid="draw-duel-screen-participants"
                    >
                      <h2 className="flex items-center gap-2 text-xl font-black">
                        <Users aria-hidden="true" className="text-electric-cyan" size={22} />
                        참가자 {connectedPlayers.length}명
                      </h2>
                      <ul className="grid max-h-[260px] gap-2 overflow-y-auto">
                        {room.players.map((player) => (
                          <li
                            className="flex min-h-11 items-center justify-between gap-3 border border-line-gray bg-panel-gray px-3 py-2"
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

                    <section
                      className="grid gap-3 border border-line-gray bg-console-black p-4"
                      data-testid="draw-duel-screen-score"
                    >
                      <h2 className="flex items-center gap-2 text-xl font-black">
                        <Trophy aria-hidden="true" className="text-coin-yellow" size={22} />
                        점수
                      </h2>
                      {scores.length > 0 ? (
                        <ol className="grid gap-2">
                          {scores.map((score, index) => (
                            <li
                              className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border border-line-gray bg-panel-gray px-3 py-2"
                              key={score.playerId}
                            >
                              <span className="font-arcade text-sm text-coin-yellow">
                                {index + 1}
                              </span>
                              <span className="min-w-0 truncate font-black text-screen-white">
                                {score.source === "ai" ? (
                                  <Bot aria-hidden="true" className="mr-2 inline text-electric-cyan" size={16} />
                                ) : null}
                                {score.nickname}
                              </span>
                              <span className="font-arcade text-lg text-coin-yellow">
                                {score.score}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm font-bold text-muted-gray">
                          게임이 시작되면 점수가 표시됩니다.
                        </p>
                      )}
                    </section>

                    <section className="grid gap-2 border border-line-gray bg-console-black p-4">
                      <h2 className="flex items-center gap-2 text-xl font-black">
                        <Crown aria-hidden="true" className="text-coin-yellow" size={22} />
                        현재 출제자
                      </h2>
                      <p className="text-2xl font-black text-screen-white">
                        {drawerPlayer?.nickname ?? "대기 중"}
                      </p>
                    </section>
                  </aside>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
