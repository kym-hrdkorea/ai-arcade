"use client";

import type {
  RealOrAiAnswerAckPayload,
  RealOrAiAnswerCountPayload,
  RealOrAiGameResultPayload,
  RealOrAiResultView,
  RealOrAiRoomState,
  RealOrAiRoundResultPayload,
  RealOrAiRoundState,
  RealOrAiTimerTickPayload,
} from "@ai-arcade/shared";
import {
  BarChart3,
  CheckCircle2,
  ListOrdered,
  LogOut,
  Maximize2,
  MousePointerClick,
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
  onLeaveRoom: () => void;
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
  isSettingResultView: boolean;
  isHost: boolean;
  onNextRound: () => void;
  onShowScore: () => void;
  result: RealOrAiRoundResultPayload;
  view: RealOrAiResultView;
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
  onLeaveRoom,
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
  const selectedCandidateLabel = getCandidateLabelById(
    round.item.candidates,
    selectedCandidateId ?? undefined,
  );

  return (
    <section className="grid gap-2 sm:gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border border-pixel-blue bg-pixel-blue/10 p-2 sm:gap-3 sm:p-3">
        <div className="min-w-0">
          <p className="font-arcade text-[0.65rem] text-electric-cyan">ROUND</p>
          <h3 className="mt-1 text-lg font-black leading-tight text-screen-white sm:text-2xl">
            {round.roundNumber}/{round.totalRounds}
          </h3>
        </div>
        <div className="grid min-h-12 min-w-20 place-items-center border border-line-gray bg-console-black px-2 text-center">
          <strong className="text-xl font-black leading-none text-screen-white">
            {remainingSeconds}
          </strong>
          <span className="mt-1 text-xs font-black text-muted-gray">초</span>
        </div>
        <div className="grid min-h-12 min-w-20 place-items-center border border-line-gray bg-console-black px-2 text-center">
          <strong className="text-xl font-black leading-none text-screen-white">
            {matchingAnswerCount.submittedCount}/{matchingAnswerCount.playerCount}
          </strong>
          <span className="mt-1 text-xs font-black text-muted-gray">제출</span>
        </div>
        <button
          aria-label="방 나가기"
          className="arcade-button arcade-button-ghost h-12 min-h-12 w-12 px-0"
          data-testid="real-ai-leave-round"
          onClick={onLeaveRoom}
          type="button"
        >
          <LogOut aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="grid min-w-0 items-stretch gap-2 lg:grid-cols-2">
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

      <div
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-line-gray bg-console-black/95 p-1.5 sm:p-3"
        data-testid="real-ai-submit-bar"
      >
        <div className="min-w-0 text-xs font-bold leading-5 text-muted-gray sm:text-sm sm:leading-6">
          {hasSubmitted ? (
            <span className="flex items-center gap-2 text-health-green">
              <CheckCircle2 aria-hidden="true" size={18} />
              <span className="truncate">
                제출 완료 · 후보{" "}
                {getCandidateLabelById(round.item.candidates, submittedAnswer.selectedCandidateId)}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <MousePointerClick aria-hidden="true" size={18} />
              <span className="truncate">
                {selectedCandidateId
                  ? `후보 ${selectedCandidateLabel} 선택 · 제출`
                  : "후보 선택 후 제출"}
              </span>
            </span>
          )}
        </div>
        <button
          className={`arcade-button h-11 min-h-11 min-w-[7.25rem] whitespace-nowrap px-3 text-sm sm:h-12 sm:min-h-12 sm:px-4 sm:text-base ${
            hasSubmitted ? "arcade-button-ghost" : "arcade-button-primary"
          }`}
          data-testid="real-ai-submit-answer"
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
          {hasSubmitted ? "제출 완료" : isSubmittingAnswer ? "제출 중" : "진짜 사진 제출"}
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
      className={`grid min-w-0 gap-2 border-2 bg-console-black p-2 sm:gap-3 sm:p-3 ${
        isSelected ? "border-coin-yellow" : "border-line-gray"
      }`}
      data-testid={`real-ai-candidate-${viewModel.label}`}
    >
      <div
        className="relative h-[clamp(200px,28svh,240px)] w-full max-w-full min-w-0 overflow-hidden border border-line-gray bg-console-black [@media(max-height:680px)]:h-[clamp(156px,25svh,168px)] [@media(min-height:681px)_and_(max-height:720px)]:h-[clamp(180px,27svh,200px)] sm:h-[clamp(240px,34svh,360px)] lg:h-[clamp(18rem,42svh,30rem)]"
        data-testid={`real-ai-candidate-${viewModel.label}-frame`}
        onPointerCancel={stopLensDrag}
        onPointerDown={startLensDrag}
        onPointerMove={moveLensDrag}
        onPointerUp={stopLensDrag}
        ref={imageFrameRef}
        style={{
          touchAction: isLensEnabled ? "none" : "auto",
        }}
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
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] gap-2">
        <button
          aria-pressed={isSelected}
          className={`arcade-button min-h-12 justify-start px-3 ${
            isSelected ? "arcade-button-secondary" : "arcade-button-ghost"
          }`}
          disabled={disabled}
          onClick={() => onSelect(viewModel.candidate.id)}
          type="button"
        >
          <span className="font-arcade text-base">후보 {viewModel.label}</span>
          <span>{submitted ? (isSelected ? "제출한 후보" : "잠김") : "선택"}</span>
        </button>
        <button
          aria-label={`후보 ${viewModel.label} 확대 도구`}
          aria-pressed={isLensEnabled}
          className={`arcade-button h-12 min-h-12 w-12 px-0 ${
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
          className="arcade-button arcade-button-ghost h-12 min-h-12 w-12 px-0"
          onClick={() => onOpenZoom(viewModel)}
          type="button"
        >
          <Maximize2 aria-hidden="true" size={18} />
        </button>
      </div>
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
    <div className="fixed inset-0 z-50 grid bg-console-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:place-items-center sm:px-4 sm:py-6">
      <section
        aria-labelledby="real-ai-zoom-title"
        aria-modal="true"
        className="arcade-panel grid h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-screen grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-3 sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:max-w-5xl sm:gap-4 sm:p-5"
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
            data-testid="real-ai-zoom-close"
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
          className="relative grid min-h-0 cursor-grab place-items-center overflow-hidden border-2 border-line-gray bg-console-black active:cursor-grabbing"
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
              className="max-h-full w-auto max-w-full select-none object-contain"
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
        </div>
      </section>
    </div>
  );
}

export function RealOrAiRoundResultPanel({
  currentPlayerId,
  isAdvancingRound,
  isSettingResultView,
  isHost,
  onNextRound,
  onShowScore,
  result,
  view,
}: RealOrAiRoundResultPanelProps) {
  const playerEntry = getRoundEntryForPlayer(result, currentPlayerId);
  const correctLabel = getCandidateLabelById(result.candidates, result.correctCandidateId);
  const selectedLabel = getCandidateLabelById(result.candidates, playerEntry?.selectedCandidateId);
  const isLastRound = result.roundNumber >= result.totalRounds;
  const playerAnswerText = playerEntry
    ? playerEntry.isCorrect
      ? "정답"
      : "오답"
    : "미제출";
  const rankedEntries = [...result.entries].sort((first, second) => {
    if (second.pointsAwarded !== first.pointsAwarded) {
      return second.pointsAwarded - first.pointsAwarded;
    }

    const firstTime = first.responseTimeMs ?? Number.POSITIVE_INFINITY;
    const secondTime = second.responseTimeMs ?? Number.POSITIVE_INFINITY;

    if (firstTime !== secondTime) {
      return firstTime - secondTime;
    }

    return first.nickname.localeCompare(second.nickname, "ko");
  });

  return (
    <section
      className="grid gap-3 border border-health-green bg-health-green/10 p-2 sm:mt-5 sm:gap-5 sm:p-4"
      data-testid="real-ai-round-result"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-arcade text-xs text-health-green">
            {view === "answer" ? "정답 공개" : "점수 정산"}
          </p>
          <h3 className="mt-1 text-xl font-black leading-tight text-screen-white sm:text-2xl">
            라운드 {result.roundNumber} / {result.totalRounds}
          </h3>
        </div>
        <span className="arcade-badge arcade-badge-green">
          {resultReasonLabel(result.reason)}
        </span>
      </div>

      {view === "answer" ? (
        <>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
            {result.candidates.map((candidate, index) => {
              const label = index === 0 ? "A" : "B";
              const isCorrect = candidate.id === result.correctCandidateId;
              const isSelected = playerEntry?.selectedCandidateId === candidate.id;

              return (
                <article
                  className={`min-w-0 border-2 bg-console-black p-1.5 sm:p-3 ${
                    isCorrect ? "border-health-green" : "border-line-gray"
                  }`}
                  data-testid={`real-ai-result-candidate-${label}`}
                  key={candidate.id}
                >
                  <div className="relative h-[clamp(132px,28svh,190px)] overflow-hidden border border-line-gray bg-panel-gray sm:h-[clamp(16rem,36vh,30rem)]">
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
                    <span className="absolute left-2 top-2 border border-coin-yellow bg-console-black px-2 py-1 font-arcade text-sm text-coin-yellow sm:left-3 sm:top-3 sm:px-3 sm:py-2 sm:text-xl">
                      {label}
                    </span>
                    {isCorrect ? (
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 border border-health-green bg-console-black px-2 py-1 text-xs font-black text-health-green sm:bottom-3 sm:left-3 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
                        <CheckCircle2 aria-hidden="true" size={14} />
                        정답
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-1 text-sm font-bold sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                    <strong className="text-screen-white">{sourceTypeLabel(candidate.sourceType)}</strong>
                    <span className={isSelected ? "text-coin-yellow" : "text-muted-gray"}>
                      {isSelected ? "내 선택" : `후보 ${label}`}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          <div
            className="grid grid-cols-3 gap-2 border border-line-gray bg-console-black p-2 sm:p-3"
            data-testid="real-ai-answer-result-summary"
          >
            <div className="grid min-h-14 content-center border border-line-gray bg-panel-gray px-2 py-2">
              <strong className="text-base leading-tight text-screen-white sm:text-lg">
                후보 {correctLabel}
              </strong>
              <span className="mt-1 text-xs font-bold text-muted-gray sm:text-sm">정답</span>
            </div>
            <div className="grid min-h-14 content-center border border-line-gray bg-panel-gray px-2 py-2">
              <strong className="text-base leading-tight text-screen-white sm:text-lg">
                {playerEntry ? `후보 ${selectedLabel}` : "미제출"}
              </strong>
              <span className="mt-1 text-xs font-bold text-muted-gray sm:text-sm">내 선택</span>
            </div>
            <div className="grid min-h-14 content-center border border-line-gray bg-panel-gray px-2 py-2">
              <strong className="text-base leading-tight text-screen-white sm:text-lg">
                {playerAnswerText}
              </strong>
              <span className="mt-1 text-xs font-bold text-muted-gray sm:text-sm">판정</span>
            </div>
          </div>

          {isHost ? (
            <button
              className="arcade-button arcade-button-primary min-h-12 justify-self-stretch sm:justify-self-start"
              data-testid="real-ai-show-score"
              disabled={isSettingResultView}
              onClick={onShowScore}
              type="button"
            >
              <BarChart3 aria-hidden="true" size={18} />
              {isSettingResultView ? "점수 여는 중" : "점수 보기"}
            </button>
          ) : (
            <p className="border border-line-gray bg-console-black p-3 text-sm font-bold text-muted-gray">
              호스트가 점수 화면으로 넘기고 있습니다.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="grid gap-2 border border-line-gray bg-console-black p-3">
              <p className="inline-flex items-center gap-2 font-black text-screen-white">
                <Trophy aria-hidden="true" className="text-coin-yellow" size={18} />
                이번 라운드 최고 득점
              </p>
              <p className="text-sm font-bold text-coin-yellow">
                {getTopScorerSummary(result)}
              </p>
            </div>
            {isHost ? (
              <button
                className="arcade-button arcade-button-primary min-h-12 justify-self-stretch sm:justify-self-start"
                disabled={isAdvancingRound}
                onClick={onNextRound}
                type="button"
              >
                {isLastRound ? (
                  <Maximize2 aria-hidden="true" size={18} />
                ) : (
                  <ListOrdered aria-hidden="true" size={18} />
                )}
                {isLastRound ? "최종 랭킹 보기" : "다음 라운드"}
              </button>
            ) : (
              <p className="border border-line-gray bg-console-black p-3 text-sm font-bold text-muted-gray">
                호스트가 다음 진행을 준비하고 있습니다.
              </p>
            )}
          </div>

          <div className="grid gap-3 border border-line-gray bg-console-black p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-black text-screen-white">현재 라운드 순위</p>
              <p className="text-xs font-bold text-muted-gray">정답 후보 {correctLabel}</p>
            </div>
            <div className="grid gap-2" data-testid="real-ai-score-result-list">
              {rankedEntries.map((entry, index) => (
                <div
                  className={`grid gap-2 border px-3 py-2 text-sm font-bold sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] ${
                    entry.playerId === currentPlayerId
                      ? "border-coin-yellow bg-coin-yellow/10"
                      : "border-line-gray bg-panel-gray"
                  }`}
                  key={entry.playerId}
                >
                  <span className="font-arcade text-coin-yellow">#{index + 1}</span>
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
        </>
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
