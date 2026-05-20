"use client";

import type {
  RealOrAiAnswerAckPayload,
  RealOrAiAnswerCountPayload,
  RealOrAiGameResultPayload,
  RealOrAiRoomState,
  RealOrAiRoundResultPayload,
  RealOrAiRoundState,
  RealOrAiTimerTickPayload,
} from "@ai-arcade/shared";
import {
  CheckCircle2,
  Maximize2,
  MousePointerClick,
  Search,
  Trophy,
  X,
  ZoomIn,
} from "lucide-react";
import Image from "next/image";
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createCandidateViewModels,
  formatResponseTime,
  getCandidateLabelById,
  getClampedContainMagnifierGeometry,
  getRoundEntryForPlayer,
  getTopScorerSummary,
  type MagnifierGeometry,
  type RealOrAiCandidateViewModel,
} from "./real-or-ai-play-helpers";

type ZoomLevel = 1 | 2 | 4;

type RealOrAiAnsweringPanelProps = {
  answerCount: RealOrAiAnswerCountPayload | null;
  currentPlayerId: string | null;
  isSubmittingAnswer: boolean;
  onCandidateSelect: (candidateId: string) => void;
  onSubmitAnswer: () => void;
  room: RealOrAiRoomState;
  round: RealOrAiRoundState;
  selectedCandidateId: string | null;
  submittedAnswer: RealOrAiAnswerAckPayload | null;
  timer: RealOrAiTimerTickPayload | null;
};

type RealOrAiRoundResultPanelProps = {
  currentPlayerId: string | null;
  isAdvancingRound: boolean;
  isHost: boolean;
  onNextRound: () => void;
  result: RealOrAiRoundResultPayload;
};

type RealOrAiFinalResultPanelProps = {
  currentPlayerId: string | null;
  gameResult: RealOrAiGameResultPayload;
  isHost: boolean;
  onResetRoom: () => void;
};

type CandidateCardProps = {
  disabled: boolean;
  isSelected: boolean;
  onOpenZoom: (candidate: RealOrAiCandidateViewModel) => void;
  onSelect: (candidateId: string) => void;
  submitted: boolean;
  viewModel: RealOrAiCandidateViewModel;
};

type ImageZoomDialogProps = {
  onClose: () => void;
  viewModel: RealOrAiCandidateViewModel;
};

const inlineLensSize = 144;
const inlineLensZoom = 2;

function sourceTypeLabel(sourceType: "ai" | "real") {
  return sourceType === "real" ? "실제 사진" : "AI 생성";
}

function resultReasonLabel(reason: RealOrAiRoundResultPayload["reason"]) {
  const labels: Record<RealOrAiRoundResultPayload["reason"], string> = {
    "all-submitted": "모두 제출",
    "operator-skip": "호스트 스킵",
    "time-up": "시간 종료",
  };

  return labels[reason];
}

export function RealOrAiAnsweringPanel({
  answerCount,
  currentPlayerId,
  isSubmittingAnswer,
  onCandidateSelect,
  onSubmitAnswer,
  room,
  round,
  selectedCandidateId,
  submittedAnswer,
  timer,
}: RealOrAiAnsweringPanelProps) {
  const [zoomCandidate, setZoomCandidate] = useState<RealOrAiCandidateViewModel | null>(null);
  const candidateViews = useMemo(
    () => createCandidateViewModels(round.item.candidates),
    [round.item.candidates],
  );
  const matchingAnswerCount =
    answerCount?.roundId === round.roundId
      ? answerCount
      : {
          playerCount: room.players.filter((player) => player.connectionStatus === "connected")
            .length,
          roomCode: room.roomCode,
          roundId: round.roundId,
          submittedCount: submittedAnswer?.roundId === round.roundId ? 1 : 0,
        };
  const hasSubmitted = submittedAnswer?.roundId === round.roundId;
  const remainingSeconds = timer?.roundId === round.roundId
    ? timer.remainingSeconds
    : room.settings.roundDurationSeconds;

  return (
    <section className="mt-3 grid gap-3 border border-pixel-blue bg-pixel-blue/10 p-2 sm:gap-4 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-arcade text-xs text-electric-cyan">ROUND</p>
          <h3 className="mt-1 text-2xl font-black text-screen-white">
            {round.roundNumber} / {round.totalRounds}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="arcade-meter min-h-16 px-3 py-2">
            <strong>{remainingSeconds}</strong>
            <span>남은 초</span>
          </div>
          <div className="arcade-meter min-h-16 px-3 py-2">
            <strong>
              {matchingAnswerCount.submittedCount}/{matchingAnswerCount.playerCount}
            </strong>
            <span>제출</span>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-2">
        {candidateViews.map((viewModel) => (
          <CandidateCard
            disabled={hasSubmitted || isSubmittingAnswer}
            isSelected={selectedCandidateId === viewModel.candidate.id}
            key={viewModel.candidate.id}
            onOpenZoom={setZoomCandidate}
            onSelect={onCandidateSelect}
            submitted={hasSubmitted}
            viewModel={viewModel}
          />
        ))}
      </div>

      <div className="sticky bottom-2 z-20 grid gap-3 border border-line-gray bg-console-black/95 p-3 shadow-panel sm:static sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="text-sm font-bold leading-6 text-muted-gray">
          {hasSubmitted ? (
            <span className="inline-flex items-center gap-2 text-health-green">
              <CheckCircle2 aria-hidden="true" size={18} />
              제출 완료 · 후보{" "}
              {getCandidateLabelById(round.item.candidates, submittedAnswer.selectedCandidateId)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <MousePointerClick aria-hidden="true" size={18} />
              진짜 사진이라고 생각하는 후보를 고른 뒤 제출하세요.
            </span>
          )}
        </div>
        <button
          className="arcade-button arcade-button-primary"
          disabled={
            !currentPlayerId ||
            !selectedCandidateId ||
            hasSubmitted ||
            isSubmittingAnswer ||
            remainingSeconds <= 0
          }
          onClick={onSubmitAnswer}
          type="button"
        >
          {isSubmittingAnswer ? "제출 중" : "진짜 사진으로 제출"}
        </button>
      </div>

      {zoomCandidate ? (
        <ImageZoomDialog onClose={() => setZoomCandidate(null)} viewModel={zoomCandidate} />
      ) : null}
    </section>
  );
}

function CandidateCard({
  disabled,
  isSelected,
  onOpenZoom,
  onSelect,
  submitted,
  viewModel,
}: CandidateCardProps) {
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const [lensGeometry, setLensGeometry] = useState<MagnifierGeometry | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [isLensEnabled, setIsLensEnabled] = useState(false);
  const [isLensDragging, setIsLensDragging] = useState(false);

  const updateLensAtPoint = useCallback((clientX: number, clientY: number) => {
    const frame = imageFrameRef.current;

    if (!frame || imageFailed) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    const geometry = getClampedContainMagnifierGeometry({
      containerHeight: rect.height,
      containerWidth: rect.width,
      imageHeight: viewModel.candidate.height,
      imageWidth: viewModel.candidate.width,
      lensSize: inlineLensSize,
      pointerX: clientX - rect.left,
      pointerY: clientY - rect.top,
      zoom: inlineLensZoom,
    });
    setLensGeometry(geometry);
  }, [imageFailed, viewModel.candidate.height, viewModel.candidate.width]);

  const toggleLens = useCallback(() => {
    setIsLensEnabled((current) => {
      const next = !current;

      if (!next) {
        setIsLensDragging(false);
        setLensGeometry(null);
        return next;
      }

      window.requestAnimationFrame(() => {
        const frame = imageFrameRef.current;

        if (!frame) {
          return;
        }

        const rect = frame.getBoundingClientRect();
        updateLensAtPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
      });

      return next;
    });
  }, [updateLensAtPoint]);

  function startLensDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }

    if (!isLensEnabled || imageFailed) {
      return;
    }

    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some synthetic pointer events cannot be captured; dragging still works.
    }

    setIsLensDragging(true);
    updateLensAtPoint(event.clientX, event.clientY);
  }

  function moveLensDrag(event: PointerEvent<HTMLDivElement>) {
    if (!isLensEnabled || !isLensDragging || imageFailed) {
      return;
    }

    event.preventDefault();
    updateLensAtPoint(event.clientX, event.clientY);
  }

  function stopLensDrag() {
    setIsLensDragging(false);
  }

  return (
    <article
      className={`grid min-w-0 gap-3 border-2 bg-console-black p-3 ${
        isSelected ? "border-coin-yellow" : "border-line-gray"
      }`}
      data-testid={`real-ai-candidate-${viewModel.label}`}
    >
      <div
        className="relative h-[clamp(12rem,30vh,22rem)] min-w-0 overflow-hidden border border-line-gray bg-console-black sm:h-[clamp(14rem,34vh,26rem)] lg:h-[clamp(14rem,32vh,22rem)]"
        data-testid={`real-ai-candidate-${viewModel.label}-frame`}
        onPointerCancel={stopLensDrag}
        onPointerDown={startLensDrag}
        onPointerMove={moveLensDrag}
        onPointerUp={stopLensDrag}
        ref={imageFrameRef}
        style={{ touchAction: isLensEnabled ? "none" : "auto" }}
      >
        {imageFailed ? (
          <div className="grid h-full place-items-center p-5 text-center">
            <div>
              <p className="text-2xl font-black text-muted-gray">이미지 없음</p>
              <p className="mt-3 text-sm font-bold leading-6 text-muted-gray">
                이미지를 불러오지 못했습니다. 새로고침하거나 다음 라운드로 진행해 주세요.
              </p>
            </div>
          </div>
        ) : (
          <Image
            alt={viewModel.imageAlt}
            className="pointer-events-none h-full w-full object-contain"
            height={viewModel.candidate.height}
            onError={() => {
              setImageFailed(true);
              setIsLensEnabled(false);
              setLensGeometry(null);
            }}
            src={viewModel.candidate.src}
            unoptimized
            width={viewModel.candidate.width}
          />
        )}

        <span className="absolute left-3 top-3 z-10 border border-coin-yellow bg-console-black px-3 py-2 font-arcade text-xl text-coin-yellow">
          {viewModel.label}
        </span>
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          <button
            aria-label={`후보 ${viewModel.label} 확대 도구`}
            aria-pressed={isLensEnabled}
            className={`arcade-button h-11 min-h-11 w-11 px-0 ${
              isLensEnabled ? "arcade-button-secondary" : "arcade-button-ghost"
            }`}
            disabled={imageFailed}
            onClick={toggleLens}
            type="button"
          >
            <ZoomIn aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={`후보 ${viewModel.label} 확대 보기`}
            className="arcade-button arcade-button-ghost h-11 min-h-11 w-11 px-0"
            onClick={() => onOpenZoom(viewModel)}
            type="button"
          >
            <Search aria-hidden="true" size={18} />
          </button>
        </div>

        {lensGeometry && isLensEnabled && !imageFailed ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-coin-yellow bg-no-repeat shadow-panel"
            data-testid={`real-ai-lens-${viewModel.label}`}
            style={{
              backgroundImage: `url("${viewModel.candidate.src}")`,
              backgroundPosition: lensGeometry.backgroundPosition,
              backgroundSize: lensGeometry.backgroundSize,
              height: `${inlineLensSize}px`,
              left: `${lensGeometry.left}px`,
              top: `${lensGeometry.top}px`,
              width: `${inlineLensSize}px`,
            }}
          />
        ) : null}
        {isLensEnabled && !imageFailed ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 border border-line-gray bg-console-black/90 px-3 py-2 text-xs font-bold text-muted-gray">
            돋보기를 손가락이나 마우스로 드래그하세요.
          </div>
        ) : null}
      </div>

      <button
        aria-pressed={isSelected}
        className={`arcade-button ${
          isSelected ? "arcade-button-secondary" : "arcade-button-ghost"
        }`}
        disabled={disabled}
        onClick={() => onSelect(viewModel.candidate.id)}
        type="button"
      >
        {submitted ? (isSelected ? "제출한 후보" : "제출 후 잠김") : `후보 ${viewModel.label} 선택`}
      </button>
    </article>
  );
}

function ImageZoomDialog({ onClose, viewModel }: ImageZoomDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(2);
  const [imageFailed, setImageFailed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{
    panX: number;
    panY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (zoomLevel === 1) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      panX: pan.x,
      panY: pan.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    });
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart) {
      return;
    }

    setPan({
      x: dragStart.panX + event.clientX - dragStart.pointerX,
      y: dragStart.panY + event.clientY - dragStart.pointerY,
    });
  }

  function stopPan() {
    setDragStart(null);
  }

  function changeZoom(nextZoomLevel: ZoomLevel) {
    setZoomLevel(nextZoomLevel);

    if (nextZoomLevel === 1) {
      setPan({ x: 0, y: 0 });
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-console-black/90 px-4 py-6">
      <section
        aria-labelledby="real-ai-zoom-title"
        aria-modal="true"
        className="arcade-panel grid max-h-full w-full max-w-[calc(100vw-2rem)] gap-4 overflow-auto p-4 sm:max-w-5xl sm:p-5"
        role="dialog"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-arcade text-xs text-electric-cyan">확대 보기</p>
            <h2 className="mt-2 text-2xl font-black text-coin-yellow" id="real-ai-zoom-title">
              후보 {viewModel.label} 확대 보기
            </h2>
          </div>
          <button
            aria-label="확대 보기 닫기"
            className="arcade-button arcade-button-ghost h-11 min-h-11 w-11 px-0"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 4].map((level) => (
            <button
              aria-pressed={zoomLevel === level}
              className={
                zoomLevel === level
                  ? "arcade-button arcade-button-secondary"
                  : "arcade-button arcade-button-ghost"
              }
              key={level}
              onClick={() => changeZoom(level as ZoomLevel)}
              type="button"
            >
              <ZoomIn aria-hidden="true" size={16} />
              {level}x
            </button>
          ))}
        </div>

        <div
          className="relative grid min-h-[52vh] cursor-grab place-items-center overflow-hidden border-2 border-line-gray bg-console-black active:cursor-grabbing"
          onPointerCancel={stopPan}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
          style={{ touchAction: zoomLevel === 1 ? "auto" : "none" }}
        >
          {imageFailed ? (
            <div className="p-8 text-center">
              <p className="text-3xl font-black text-muted-gray">이미지 없음</p>
              <p className="mt-4 text-sm font-bold leading-6 text-muted-gray">
                확대 이미지를 불러오지 못했습니다. 창을 닫고 다시 시도해 주세요.
              </p>
            </div>
          ) : (
            <Image
              alt={viewModel.imageAlt}
              className="max-h-[76vh] w-auto max-w-full select-none object-contain"
              draggable={false}
              height={viewModel.candidate.height}
              onError={() => setImageFailed(true)}
              src={viewModel.candidate.src}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                transition: dragStart ? "none" : "transform 140ms ease",
              }}
              unoptimized
              width={viewModel.candidate.width}
            />
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 border border-line-gray bg-console-black/90 px-3 py-2 text-xs font-bold text-muted-gray">
            드래그해서 위치를 조정할 수 있습니다.
          </div>
        </div>
      </section>
    </div>
  );
}

export function RealOrAiRoundResultPanel({
  currentPlayerId,
  isAdvancingRound,
  isHost,
  onNextRound,
  result,
}: RealOrAiRoundResultPanelProps) {
  const playerEntry = getRoundEntryForPlayer(result, currentPlayerId);
  const correctLabel = getCandidateLabelById(result.candidates, result.correctCandidateId);
  const selectedLabel = getCandidateLabelById(result.candidates, playerEntry?.selectedCandidateId);
  const isLastRound = result.roundNumber >= result.totalRounds;

  return (
    <section className="mt-5 grid gap-5 border border-health-green bg-health-green/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-arcade text-xs text-health-green">라운드 결과</p>
          <h3 className="mt-1 text-2xl font-black text-screen-white">
            라운드 {result.roundNumber} / {result.totalRounds}
          </h3>
        </div>
        <span className="arcade-badge arcade-badge-green">
          {resultReasonLabel(result.reason)}
        </span>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {result.candidates.map((candidate, index) => {
          const label = index === 0 ? "A" : "B";
          const isCorrect = candidate.id === result.correctCandidateId;

          return (
            <article
              className={`min-w-0 border-2 bg-console-black p-3 ${
                isCorrect ? "border-health-green" : "border-line-gray"
              }`}
              key={candidate.id}
            >
              <div className="relative h-[clamp(16rem,36vh,30rem)] overflow-hidden border border-line-gray bg-panel-gray">
                <Image
                  alt={`결과 후보 ${label} 사진`}
                  className="h-full w-full object-contain"
                  height={candidate.height}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  src={candidate.src}
                  unoptimized
                  width={candidate.width}
                />
                <span className="absolute left-3 top-3 border border-coin-yellow bg-console-black px-3 py-2 font-arcade text-xl text-coin-yellow">
                  {label}
                </span>
                {isCorrect ? (
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 border border-health-green bg-console-black px-3 py-2 text-sm font-black text-health-green">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    정답
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <strong className="text-screen-white">{sourceTypeLabel(candidate.sourceType)}</strong>
                <span className="text-sm font-bold text-muted-gray">
                  후보 {label}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="arcade-meter">
          <strong>후보 {correctLabel}</strong>
          <span>정답</span>
        </div>
        <div className="arcade-meter">
          <strong>{playerEntry ? `후보 ${selectedLabel}` : "미제출"}</strong>
          <span>내 선택</span>
        </div>
        <div className="arcade-meter">
          <strong>{playerEntry?.pointsAwarded ?? 0}점</strong>
          <span>{playerEntry?.isCorrect ? "정답" : "오답 또는 미제출"}</span>
        </div>
      </div>

      <div className="grid gap-3 border border-line-gray bg-console-black p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 font-black text-screen-white">
            <Trophy aria-hidden="true" className="text-coin-yellow" size={18} />
            최고 득점
          </p>
          <p className="text-sm font-bold text-coin-yellow">{getTopScorerSummary(result)}</p>
        </div>
        <div className="grid gap-2">
          {result.entries.map((entry) => (
            <div
              className="grid gap-2 border border-line-gray bg-panel-gray px-3 py-2 text-sm font-bold sm:grid-cols-[1fr_auto_auto]"
              key={entry.playerId}
            >
              <span className="truncate text-screen-white">
                {entry.nickname}
                {entry.playerId === currentPlayerId ? " (나)" : ""}
              </span>
              <span className={entry.isCorrect ? "text-health-green" : "text-muted-gray"}>
                {entry.isCorrect ? "정답" : "오답"}
              </span>
              <span className="text-muted-gray">
                {entry.pointsAwarded}점 · {formatResponseTime(entry.responseTimeMs)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button
          className="arcade-button arcade-button-primary justify-self-start"
          disabled={isAdvancingRound}
          onClick={onNextRound}
          type="button"
        >
          <Maximize2 aria-hidden="true" size={18} />
          {isLastRound ? "최종 랭킹 보기" : "다음 라운드"}
        </button>
      ) : (
        <p className="border border-line-gray bg-console-black p-3 text-sm font-bold text-muted-gray">
          호스트가 다음 진행을 선택하고 있습니다.
        </p>
      )}
    </section>
  );
}

export function RealOrAiFinalResultPanel({
  currentPlayerId,
  gameResult,
  isHost,
  onResetRoom,
}: RealOrAiFinalResultPanelProps) {
  return (
    <section className="mt-5 grid gap-5 border border-coin-yellow bg-coin-yellow/10 p-4">
      <div>
        <p className="font-arcade text-xs text-coin-yellow">최종 결과</p>
        <h3 className="mt-1 text-2xl font-black text-screen-white">최종 랭킹</h3>
      </div>

      <div className="grid gap-3">
        {gameResult.results.map((entry) => (
          <article
            className={`grid gap-3 border-2 bg-console-black p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center ${
              entry.playerId === currentPlayerId ? "border-coin-yellow" : "border-line-gray"
            }`}
            key={entry.playerId}
          >
            <div className="grid h-14 w-14 place-items-center border border-line-gray bg-panel-gray font-arcade text-xl text-coin-yellow">
              #{entry.rank}
            </div>
            <div>
              <h4 className="text-lg font-black text-screen-white">
                {entry.nickname}
                {entry.playerId === currentPlayerId ? " (나)" : ""}
              </h4>
              <p className="mt-1 text-sm font-bold text-muted-gray">
                정답 {entry.correctCount}개 · 평균{" "}
                {formatResponseTime(entry.averageCorrectResponseMs)}
              </p>
            </div>
            <strong className="text-2xl text-health-green">{entry.totalScore}점</strong>
          </article>
        ))}
      </div>

      {isHost ? (
        <button
          className="arcade-button arcade-button-secondary justify-self-start"
          onClick={onResetRoom}
          type="button"
        >
          다시 대기실로
        </button>
      ) : (
        <p className="border border-line-gray bg-console-black p-3 text-sm font-bold text-muted-gray">
          호스트가 다음 게임 준비를 진행합니다.
        </p>
      )}
    </section>
  );
}
