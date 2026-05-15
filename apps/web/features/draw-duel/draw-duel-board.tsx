"use client";

import type {
  ClientToServerEvents,
  DrawPoint,
  DrawStrokePayload,
  DrawTool,
  RoomState,
  ServerToClientEvents,
} from "@ai-arcade/shared";
import { Brush, Circle, Eraser, Eye, PenLine, Trash2 } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Socket } from "socket.io-client";

type DrawDuelSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type DrawDuelBoardProps = {
  canDraw: boolean;
  currentPlayerId: string | null;
  drawStatus: string;
  initialStrokes: DrawStrokePayload[];
  room: RoomState;
  socket: DrawDuelSocket | null;
};

type ActiveStroke = {
  color: string;
  hasSent: boolean;
  lastPoint: DrawPoint;
  lastSentAt: number;
  lastSentPoint: DrawPoint;
  pendingPoints: DrawPoint[];
  playerId: string;
  strokeId: string;
  tool: DrawTool;
  width: number;
};

const logicalCanvasWidth = 960;
const logicalCanvasHeight = 600;
const sendIntervalMs = 50;
const localHistoryLimit = 500;
const defaultColor = "#22d3ee";

const colorOptions = [defaultColor, "#facc15", "#ef4444", "#22c55e"] as const;
const widthOptions = [
  { label: "S", title: "얇게", value: 4 },
  { label: "M", title: "보통", value: 8 },
  { label: "L", title: "굵게", value: 14 },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createStrokeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `stroke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pointFromPointer(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): DrawPoint {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * logicalCanvasWidth;
  const y = ((event.clientY - rect.top) / rect.height) * logicalCanvasHeight;

  return {
    x: clamp(x, 0, logicalCanvasWidth),
    y: clamp(y, 0, logicalCanvasHeight),
    t: Math.max(0, Math.round(performance.now())),
  };
}

function pointsAreClose(first: DrawPoint, second: DrawPoint) {
  return Math.abs(first.x - second.x) < 0.5 && Math.abs(first.y - second.y) < 0.5;
}

function configureCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.setTransform(
    pixelWidth / logicalCanvasWidth,
    0,
    0,
    pixelHeight / logicalCanvasHeight,
    0,
    0,
  );
  context.lineCap = "round";
  context.lineJoin = "round";
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function drawStroke(canvas: HTMLCanvasElement, stroke: DrawStrokePayload) {
  const context = canvas.getContext("2d");
  const firstPoint = stroke.points[0];

  if (!context || !firstPoint) {
    return;
  }

  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.width;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;

  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(firstPoint.x, firstPoint.y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  context.stroke();
  context.restore();
}

export function DrawDuelBoard({
  canDraw,
  currentPlayerId,
  drawStatus,
  initialStrokes,
  room,
  socket,
}: DrawDuelBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<DrawStrokePayload[]>([]);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState(defaultColor);
  const [width, setWidth] = useState(8);
  const [boardMessage, setBoardMessage] = useState<string | null>(null);

  const canUseTools = Boolean(socket && currentPlayerId && canDraw);

  const rememberStroke = useCallback((stroke: DrawStrokePayload) => {
    historyRef.current.push(stroke);

    if (historyRef.current.length > localHistoryLimit) {
      historyRef.current.splice(0, historyRef.current.length - localHistoryLimit);
    }
  }, []);

  const redrawHistory = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    configureCanvas(canvas);

    for (const stroke of historyRef.current) {
      drawStroke(canvas, stroke);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    redrawHistory();

    const observer = new ResizeObserver(() => {
      redrawHistory();
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [redrawHistory]);

  useEffect(() => {
    historyRef.current = [];
    activeStrokeRef.current = null;
    setBoardMessage(null);
    redrawHistory();
  }, [redrawHistory, room.roomCode]);

  useEffect(() => {
    historyRef.current = initialStrokes;
    redrawHistory();
  }, [initialStrokes, redrawHistory]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function handleStroke(stroke: DrawStrokePayload) {
      if (stroke.roomCode !== room.roomCode) {
        return;
      }

      const canvas = canvasRef.current;
      rememberStroke(stroke);

      if (canvas) {
        drawStroke(canvas, stroke);
      }
    }

    function handleClear(payload: { roomCode: string }) {
      if (payload.roomCode !== room.roomCode) {
        return;
      }

      const canvas = canvasRef.current;
      historyRef.current = [];

      if (canvas) {
        clearCanvas(canvas);
      }
    }

    function handleHistory(payload: { roomCode: string; strokes: DrawStrokePayload[] }) {
      if (payload.roomCode !== room.roomCode) {
        return;
      }

      historyRef.current = payload.strokes;
      redrawHistory();
    }

    socket.on("draw-duel:stroke", handleStroke);
    socket.on("draw-duel:canvas-clear", handleClear);
    socket.on("draw-duel:stroke-history", handleHistory);

    return () => {
      socket.off("draw-duel:stroke", handleStroke);
      socket.off("draw-duel:canvas-clear", handleClear);
      socket.off("draw-duel:stroke-history", handleHistory);
    };
  }, [redrawHistory, rememberStroke, room.roomCode, socket]);

  const sendStrokeChunk = useCallback(
    (isComplete: boolean) => {
      const activeStroke = activeStrokeRef.current;

      if (!activeStroke || !socket) {
        return;
      }

      const points = activeStroke.hasSent
        ? [activeStroke.lastSentPoint, ...activeStroke.pendingPoints]
        : [...activeStroke.pendingPoints];

      if (points.length === 0) {
        if (!isComplete) {
          return;
        }

        points.push(activeStroke.lastSentPoint);
      }

      if (!isComplete && activeStroke.hasSent && activeStroke.pendingPoints.length === 0) {
        return;
      }

      const lastPoint = points[points.length - 1] ?? activeStroke.lastSentPoint;
      const payload: DrawStrokePayload = {
        roomCode: room.roomCode,
        strokeId: activeStroke.strokeId,
        playerId: activeStroke.playerId,
        points,
        color: activeStroke.color,
        width: activeStroke.width,
        tool: activeStroke.tool,
        isComplete,
      };

      rememberStroke(payload);
      socket.emit("draw-duel:stroke", payload, (response) => {
        if (!response.ok) {
          setBoardMessage(response.error.message);
        }
      });

      activeStroke.lastSentPoint = lastPoint;
      activeStroke.pendingPoints = [];
      activeStroke.hasSent = true;
      activeStroke.lastSentAt = performance.now();
    },
    [rememberStroke, room.roomCode, socket],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !canUseTools || !currentPlayerId) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);

    const point = pointFromPointer(event, canvas);
    const activeStroke: ActiveStroke = {
      color,
      hasSent: false,
      lastPoint: point,
      lastSentAt: 0,
      lastSentPoint: point,
      pendingPoints: [point],
      playerId: currentPlayerId,
      strokeId: createStrokeId(),
      tool,
      width,
    };

    activeStrokeRef.current = activeStroke;
    setBoardMessage(null);
    drawStroke(canvas, {
      roomCode: room.roomCode,
      strokeId: activeStroke.strokeId,
      playerId: activeStroke.playerId,
      points: [point],
      color: activeStroke.color,
      width: activeStroke.width,
      tool: activeStroke.tool,
      isComplete: false,
    });
    sendStrokeChunk(false);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const activeStroke = activeStrokeRef.current;

    if (!canvas || !activeStroke) {
      return;
    }

    event.preventDefault();

    const point = pointFromPointer(event, canvas);

    if (pointsAreClose(activeStroke.lastPoint, point)) {
      return;
    }

    drawStroke(canvas, {
      roomCode: room.roomCode,
      strokeId: activeStroke.strokeId,
      playerId: activeStroke.playerId,
      points: [activeStroke.lastPoint, point],
      color: activeStroke.color,
      width: activeStroke.width,
      tool: activeStroke.tool,
      isComplete: false,
    });

    activeStroke.lastPoint = point;
    activeStroke.pendingPoints.push(point);

    if (performance.now() - activeStroke.lastSentAt >= sendIntervalMs) {
      sendStrokeChunk(false);
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const activeStroke = activeStrokeRef.current;

    if (!canvas || !activeStroke) {
      return;
    }

    event.preventDefault();

    if (event.type !== "pointercancel") {
      const point = pointFromPointer(event, canvas);

      if (!pointsAreClose(activeStroke.lastPoint, point)) {
        drawStroke(canvas, {
          roomCode: room.roomCode,
          strokeId: activeStroke.strokeId,
          playerId: activeStroke.playerId,
          points: [activeStroke.lastPoint, point],
          color: activeStroke.color,
          width: activeStroke.width,
          tool: activeStroke.tool,
          isComplete: false,
        });
        activeStroke.lastPoint = point;
        activeStroke.pendingPoints.push(point);
      }
    }

    sendStrokeChunk(true);
    activeStrokeRef.current = null;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function clearBoard() {
    const canvas = canvasRef.current;

    if (!socket || !currentPlayerId || !canUseTools) {
      return;
    }

    const payload = {
      roomCode: room.roomCode,
      playerId: currentPlayerId,
      clearedAt: new Date().toISOString(),
    };

    historyRef.current = [];

    if (canvas) {
      clearCanvas(canvas);
    }

    socket.emit("draw-duel:canvas-clear", payload, (response) => {
      if (!response.ok) {
        setBoardMessage(response.error.message);
      }
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black">
            <Brush aria-hidden="true" className="text-electric-cyan" size={22} />
            실시간 드로잉
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-gray">{drawStatus}</p>
        </div>
        <span className={canUseTools ? "arcade-badge arcade-badge-green" : "arcade-badge"}>
          {canUseTools ? "드로어" : "관전"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="펜"
          aria-pressed={tool === "pen"}
          className={`arcade-button h-12 w-12 p-0 ${
            tool === "pen" ? "arcade-button-secondary" : "arcade-button-ghost"
          }`}
          disabled={!canUseTools}
          onClick={() => setTool("pen")}
          title="펜"
          type="button"
        >
          <PenLine aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="지우개"
          aria-pressed={tool === "eraser"}
          className={`arcade-button h-12 w-12 p-0 ${
            tool === "eraser" ? "arcade-button-secondary" : "arcade-button-ghost"
          }`}
          disabled={!canUseTools}
          onClick={() => setTool("eraser")}
          title="지우개"
          type="button"
        >
          <Eraser aria-hidden="true" size={18} />
        </button>

        <div className="flex flex-wrap gap-2" aria-label="펜 굵기">
          {widthOptions.map((option) => (
            <button
              aria-label={option.title}
              aria-pressed={width === option.value}
              className={`arcade-button h-12 min-w-12 px-3 ${
                width === option.value ? "arcade-button-primary" : "arcade-button-ghost"
              }`}
              disabled={!canUseTools}
              key={option.value}
              onClick={() => setWidth(option.value)}
              title={option.title}
              type="button"
            >
              <Circle aria-hidden="true" fill="currentColor" size={option.value + 8} />
              <span className="sr-only">{option.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" aria-label="펜 색상">
          {colorOptions.map((option) => (
            <button
              aria-label={`색상 ${option}`}
              aria-pressed={color === option}
              className={`h-12 w-12 border-2 shadow-pixel ${
                color === option ? "border-screen-white" : "border-line-gray"
              }`}
              disabled={!canUseTools || tool === "eraser"}
              key={option}
              onClick={() => setColor(option)}
              style={{ backgroundColor: option }}
              title={`색상 ${option}`}
              type="button"
            />
          ))}
        </div>

        <button
          aria-label="전체 지우기"
          className="arcade-button arcade-button-danger h-12 w-12 p-0"
          disabled={!canUseTools}
          onClick={clearBoard}
          title="전체 지우기"
          type="button"
        >
          <Trash2 aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="relative">
        <canvas
          aria-label="Draw Duel drawing canvas"
          className={`block aspect-[8/5] w-full border-2 border-line-gray bg-screen-white ${
            canUseTools ? "cursor-crosshair" : "cursor-default"
          }`}
          onPointerCancel={finishPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          ref={canvasRef}
          style={{ touchAction: "none" }}
        />
        {!canUseTools ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center gap-2 border border-line-gray bg-console-black/90 px-3 py-2 text-sm font-bold text-muted-gray">
            <Eye aria-hidden="true" className="text-pixel-blue" size={16} />
            {drawStatus}
          </div>
        ) : null}
      </div>

      {boardMessage ? (
        <div className="border-2 border-joystick-red bg-console-black p-3 text-sm font-bold text-red-200">
          {boardMessage}
        </div>
      ) : null}
    </section>
  );
}
