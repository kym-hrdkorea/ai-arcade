import type { DrawPoint, DrawStrokePayload } from "@ai-arcade/shared";

import { drawDuelWordBank } from "./draw-duel-word-bank.js";

export type DrawDuelBenchmarkCategory =
  | "animal"
  | "body-symbol"
  | "food"
  | "hobby"
  | "household"
  | "nature"
  | "place"
  | "vehicle";

export type DrawDuelAIBenchmarkFixture = {
  aliases: string[];
  category: DrawDuelBenchmarkCategory;
  id: string;
  strokes: DrawStrokePayload[];
  word: string;
};

type Coord = readonly [number, number];

const roomCode = "BENCH1";
const playerId = "00000000-0000-4000-8000-000000000001";
const darkInk = "#0b1020";
const accentInk = "#ef4444";
const yellowInk = "#facc15";
const greenInk = "#22c55e";
const blueInk = "#38bdf8";

function point([x, y]: Coord, index: number): DrawPoint {
  return {
    x,
    y,
    t: index,
  };
}

function stroke(
  strokeId: string,
  coords: Coord[],
  color = darkInk,
  width = 16,
): DrawStrokePayload {
  return {
    roomCode,
    strokeId,
    playerId,
    points: coords.map(point),
    color,
    width,
    tool: "pen",
    isComplete: true,
  };
}

function oval(cx: number, cy: number, rx: number, ry: number, steps = 20): Coord[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / steps;
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry] as const;
  });
}

function rect(x: number, y: number, width: number, height: number): Coord[] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y],
  ];
}

function line(from: Coord, to: Coord): Coord[] {
  return [from, to];
}

function fixture(
  id: string,
  category: DrawDuelBenchmarkCategory,
  word: string,
  strokes: DrawStrokePayload[],
): DrawDuelAIBenchmarkFixture {
  const entry = drawDuelWordBank.find((candidate) => candidate.word === word);

  if (!entry) {
    throw new Error(`Benchmark word is missing from word bank: ${word}`);
  }

  return {
    aliases: [...entry.aliases],
    category,
    id,
    strokes,
    word,
  };
}

export const drawDuelAIBenchmarkFixtures = [
  fixture("animal-cat", "animal", "고양이", [
    stroke("cat-head", oval(470, 290, 100, 82)),
    stroke("cat-ear-left", [
      [390, 245],
      [420, 155],
      [455, 230],
    ]),
    stroke("cat-ear-right", [
      [485, 230],
      [530, 155],
      [555, 248],
    ]),
    stroke("cat-face", [
      [430, 285],
      [435, 285],
      [510, 285],
      [515, 285],
      [470, 310],
      [440, 335],
      [470, 315],
      [505, 335],
    ]),
    stroke("cat-whiskers", [
      [370, 300],
      [430, 305],
      [370, 330],
      [430, 318],
      [515, 305],
      [580, 300],
      [515, 318],
      [580, 330],
    ], darkInk, 8),
  ]),
  fixture("animal-dog", "animal", "강아지", [
    stroke("dog-head", oval(470, 300, 105, 88)),
    stroke("dog-ear-left", oval(375, 300, 35, 78), darkInk, 14),
    stroke("dog-ear-right", oval(565, 300, 35, 78), darkInk, 14),
    stroke("dog-face", [
      [430, 285],
      [435, 285],
      [510, 285],
      [515, 285],
      [470, 315],
      [445, 345],
      [470, 330],
      [500, 345],
    ]),
  ]),
  fixture("animal-fish", "animal", "물고기", [
    stroke("fish-body", oval(450, 300, 130, 70)),
    stroke("fish-tail", [
      [575, 300],
      [690, 220],
      [675, 300],
      [690, 380],
      [575, 300],
    ]),
    stroke("fish-eye", oval(385, 280, 9, 9), darkInk, 8),
    stroke("fish-fin", [
      [455, 300],
      [500, 235],
      [520, 300],
    ]),
  ]),
  fixture("animal-butterfly", "animal", "나비", [
    stroke("butterfly-body", line([480, 205], [480, 400]), darkInk, 14),
    stroke("butterfly-left-top", oval(410, 250, 70, 55)),
    stroke("butterfly-right-top", oval(550, 250, 70, 55)),
    stroke("butterfly-left-bottom", oval(420, 350, 62, 48)),
    stroke("butterfly-right-bottom", oval(540, 350, 62, 48)),
    stroke("butterfly-ant", [
      [480, 215],
      [445, 170],
      [480, 215],
      [515, 170],
    ], darkInk, 8),
  ]),
  fixture("food-apple", "food", "사과", [
    stroke("apple-body", oval(470, 330, 105, 100), accentInk, 18),
    stroke("apple-dent", [
      [430, 245],
      [470, 285],
      [510, 245],
    ], accentInk, 14),
    stroke("apple-stem", line([470, 250], [490, 185]), darkInk, 12),
    stroke("apple-leaf", oval(535, 205, 40, 18), greenInk, 12),
  ]),
  fixture("food-pizza", "food", "피자", [
    stroke("pizza-slice", [
      [390, 190],
      [610, 190],
      [500, 430],
      [390, 190],
    ], yellowInk, 18),
    stroke("pizza-crust", line([390, 190], [610, 190]), accentInk, 26),
    stroke("pizza-toppings", [
      [460, 255],
      [465, 255],
      [535, 270],
      [540, 270],
      [500, 335],
      [505, 335],
    ], accentInk, 16),
  ]),
  fixture("food-icecream", "food", "아이스크림", [
    stroke("icecream-scoop", oval(470, 230, 75, 65), accentInk, 18),
    stroke("icecream-scoop2", oval(535, 280, 70, 60), blueInk, 18),
    stroke("icecream-cone", [
      [405, 300],
      [600, 300],
      [500, 500],
      [405, 300],
    ], yellowInk, 16),
    stroke("icecream-grid", [
      [450, 350],
      [535, 465],
      [545, 350],
      [460, 465],
    ], darkInk, 7),
  ]),
  fixture("food-burger", "food", "햄버거", [
    stroke("burger-top", oval(480, 240, 150, 55), yellowInk, 20),
    stroke("burger-layer", line([330, 295], [630, 295]), greenInk, 18),
    stroke("burger-patty", line([345, 340], [615, 340]), darkInk, 26),
    stroke("burger-bottom", line([360, 390], [600, 390]), yellowInk, 24),
  ]),
  fixture("vehicle-car", "vehicle", "자동차", [
    stroke("car-body", rect(310, 300, 330, 90), blueInk, 18),
    stroke("car-roof", [
      [390, 300],
      [445, 235],
      [545, 235],
      [600, 300],
    ], blueInk, 18),
    stroke("car-wheels", oval(390, 400, 35, 35), darkInk, 14),
    stroke("car-wheels2", oval(570, 400, 35, 35), darkInk, 14),
  ]),
  fixture("vehicle-plane", "vehicle", "비행기", [
    stroke("plane-body", line([270, 310], [720, 310]), blueInk, 18),
    stroke("plane-nose", [
      [720, 310],
      [660, 275],
      [660, 345],
      [720, 310],
    ], blueInk, 12),
    stroke("plane-wing", [
      [475, 310],
      [410, 205],
      [555, 305],
      [475, 310],
      [475, 310],
      [410, 415],
      [555, 315],
    ], darkInk, 14),
    stroke("plane-tail", [
      [310, 310],
      [250, 240],
      [340, 305],
      [250, 380],
    ], darkInk, 12),
  ]),
  fixture("vehicle-bike", "vehicle", "자전거", [
    stroke("bike-wheel1", oval(360, 380, 65, 65), darkInk, 12),
    stroke("bike-wheel2", oval(600, 380, 65, 65), darkInk, 12),
    stroke("bike-frame", [
      [360, 380],
      [470, 285],
      [535, 380],
      [360, 380],
      [470, 285],
      [600, 380],
    ], blueInk, 12),
    stroke("bike-bar", [
      [470, 285],
      [455, 240],
      [535, 380],
      [565, 285],
      [620, 270],
    ], darkInk, 10),
  ]),
  fixture("vehicle-boat", "vehicle", "배", [
    stroke("boat-hull", [
      [320, 345],
      [650, 345],
      [585, 430],
      [385, 430],
      [320, 345],
    ], blueInk, 18),
    stroke("boat-mast", line([485, 345], [485, 175]), darkInk, 12),
    stroke("boat-sail", [
      [490, 190],
      [610, 325],
      [490, 325],
      [490, 190],
    ], darkInk, 12),
    stroke("boat-wave", [
      [280, 465],
      [340, 450],
      [400, 465],
      [460, 450],
      [520, 465],
      [580, 450],
      [640, 465],
    ], blueInk, 10),
  ]),
  fixture("household-umbrella", "household", "우산", [
    stroke("umbrella-canopy", [
      [300, 330],
      [380, 230],
      [480, 205],
      [580, 230],
      [660, 330],
    ], accentInk, 18),
    stroke("umbrella-bottom", [
      [300, 330],
      [390, 310],
      [480, 330],
      [570, 310],
      [660, 330],
    ], accentInk, 12),
    stroke("umbrella-handle", [
      [480, 330],
      [480, 500],
      [530, 500],
      [530, 455],
    ], darkInk, 14),
  ]),
  fixture("household-chair", "household", "의자", [
    stroke("chair-back", rect(390, 180, 190, 160), darkInk, 16),
    stroke("chair-seat", rect(370, 340, 230, 55), darkInk, 16),
    stroke("chair-legs", [
      [395, 395],
      [365, 500],
      [575, 395],
      [610, 500],
    ], darkInk, 14),
  ]),
  fixture("household-key", "household", "열쇠", [
    stroke("key-ring", oval(345, 310, 60, 60), yellowInk, 16),
    stroke("key-shaft", line([405, 310], [650, 310]), yellowInk, 18),
    stroke("key-teeth", [
      [595, 310],
      [595, 365],
      [635, 310],
      [635, 350],
    ], yellowInk, 14),
  ]),
  fixture("household-camera", "household", "카메라", [
    stroke("camera-body", rect(320, 240, 330, 190), darkInk, 18),
    stroke("camera-top", rect(380, 205, 95, 35), darkInk, 14),
    stroke("camera-lens", oval(485, 335, 70, 70), blueInk, 16),
    stroke("camera-flash", rect(565, 270, 45, 35), yellowInk, 10),
  ]),
  fixture("nature-sun", "nature", "태양", [
    stroke("sun-body", oval(480, 300, 75, 75), yellowInk, 18),
    stroke("sun-rays", [
      [480, 165],
      [480, 225],
      [480, 375],
      [480, 435],
      [345, 300],
      [405, 300],
      [555, 300],
      [615, 300],
      [385, 205],
      [425, 245],
      [535, 355],
      [575, 395],
      [575, 205],
      [535, 245],
      [425, 355],
      [385, 395],
    ], yellowInk, 12),
  ]),
  fixture("nature-tree", "nature", "나무", [
    stroke("tree-trunk", rect(455, 330, 55, 155), darkInk, 16),
    stroke("tree-top1", oval(480, 245, 115, 85), greenInk, 18),
    stroke("tree-top2", oval(405, 300, 85, 65), greenInk, 18),
    stroke("tree-top3", oval(555, 300, 85, 65), greenInk, 18),
  ]),
  fixture("nature-flower", "nature", "꽃", [
    stroke("flower-center", oval(480, 270, 35, 35), yellowInk, 14),
    stroke("flower-petals", [
      ...oval(480, 200, 35, 45, 12),
      ...oval(550, 270, 45, 35, 12),
      ...oval(480, 340, 35, 45, 12),
      ...oval(410, 270, 45, 35, 12),
    ], accentInk, 12),
    stroke("flower-stem", line([480, 305], [480, 500]), greenInk, 12),
    stroke("flower-leaf", oval(535, 395, 55, 22), greenInk, 10),
  ]),
  fixture("nature-rainbow", "nature", "무지개", [
    stroke("rainbow-red", [
      [260, 420],
      [340, 245],
      [480, 185],
      [620, 245],
      [700, 420],
    ], accentInk, 18),
    stroke("rainbow-yellow", [
      [310, 420],
      [375, 285],
      [480, 240],
      [585, 285],
      [650, 420],
    ], yellowInk, 18),
    stroke("rainbow-blue", [
      [360, 420],
      [410, 330],
      [480, 300],
      [550, 330],
      [600, 420],
    ], blueInk, 18),
  ]),
  fixture("place-house", "place", "집", [
    stroke("house-body", rect(350, 295, 260, 190), darkInk, 16),
    stroke("house-roof", [
      [320, 305],
      [480, 175],
      [640, 305],
    ], accentInk, 18),
    stroke("house-door", rect(455, 380, 55, 105), darkInk, 12),
    stroke("house-window", rect(535, 340, 45, 45), blueInk, 10),
  ]),
  fixture("place-school", "place", "학교", [
    stroke("school-body", rect(310, 230, 340, 240), darkInk, 16),
    stroke("school-roof", line([300, 230], [660, 230]), accentInk, 20),
    stroke("school-door", rect(455, 365, 75, 105), darkInk, 12),
    stroke("school-windows", [
      ...rect(350, 280, 55, 45),
      ...rect(555, 280, 55, 45),
      ...rect(350, 365, 55, 45),
      ...rect(555, 365, 55, 45),
    ], blueInk, 8),
    stroke("school-flag", [
      [480, 230],
      [480, 150],
      [560, 165],
      [480, 185],
    ], accentInk, 10),
  ]),
  fixture("place-bridge", "place", "다리", [
    stroke("bridge-deck", line([240, 360], [720, 360]), darkInk, 18),
    stroke("bridge-arch", [
      [300, 360],
      [380, 250],
      [480, 220],
      [580, 250],
      [660, 360],
    ], blueInk, 16),
    stroke("bridge-posts", [
      [330, 360],
      [330, 455],
      [480, 360],
      [480, 455],
      [630, 360],
      [630, 455],
    ], darkInk, 12),
    stroke("bridge-water", [
      [250, 485],
      [330, 465],
      [410, 485],
      [490, 465],
      [570, 485],
      [650, 465],
      [730, 485],
    ], blueInk, 10),
  ]),
  fixture("hobby-soccer", "hobby", "축구공", [
    stroke("soccer-ball", oval(480, 310, 110, 110), darkInk, 14),
    stroke("soccer-pentagon", [
      [480, 250],
      [535, 290],
      [515, 355],
      [445, 355],
      [425, 290],
      [480, 250],
    ], darkInk, 10),
    stroke("soccer-lines", [
      [480, 250],
      [480, 200],
      [535, 290],
      [585, 270],
      [515, 355],
      [550, 410],
      [445, 355],
      [410, 410],
      [425, 290],
      [375, 270],
    ], darkInk, 8),
  ]),
  fixture("hobby-guitar", "hobby", "기타", [
    stroke("guitar-body", oval(405, 355, 90, 110), yellowInk, 18),
    stroke("guitar-hole", oval(420, 350, 30, 30), darkInk, 10),
    stroke("guitar-neck", line([470, 295], [690, 165]), darkInk, 16),
    stroke("guitar-head", rect(675, 130, 60, 55), darkInk, 12),
    stroke("guitar-strings", [
      [430, 335],
      [705, 150],
      [445, 365],
      [715, 170],
    ], darkInk, 6),
  ]),
  fixture("hobby-mic", "hobby", "마이크", [
    stroke("mic-head", oval(470, 230, 65, 85), darkInk, 16),
    stroke("mic-grille", [
      [420, 210],
      [520, 210],
      [415, 250],
      [525, 250],
      [430, 290],
      [510, 290],
    ], blueInk, 8),
    stroke("mic-handle", line([470, 310], [470, 475]), darkInk, 22),
    stroke("mic-stand", line([400, 475], [540, 475]), darkInk, 14),
  ]),
  fixture("hobby-dice", "hobby", "주사위", [
    stroke("dice-box", rect(360, 220, 250, 250), darkInk, 16),
    stroke("dice-dots", [
      [425, 285],
      [430, 285],
      [550, 285],
      [555, 285],
      [485, 345],
      [490, 345],
      [425, 410],
      [430, 410],
      [550, 410],
      [555, 410],
    ], darkInk, 18),
  ]),
  fixture("body-hand", "body-symbol", "손", [
    stroke("hand-palm", oval(455, 355, 80, 95), darkInk, 16),
    stroke("hand-fingers", [
      [395, 320],
      [365, 220],
      [410, 318],
      [410, 195],
      [435, 315],
      [455, 175],
      [465, 318],
      [505, 205],
      [490, 335],
      [565, 260],
    ], darkInk, 18),
    stroke("hand-wrist", rect(425, 435, 75, 90), darkInk, 14),
  ]),
  fixture("symbol-heart", "body-symbol", "하트", [
    stroke("heart-left", oval(420, 270, 70, 60), accentInk, 20),
    stroke("heart-right", oval(540, 270, 70, 60), accentInk, 20),
    stroke("heart-point", [
      [360, 305],
      [480, 455],
      [600, 305],
    ], accentInk, 22),
  ]),
  fixture("symbol-crown", "body-symbol", "왕관", [
    stroke("crown-base", rect(330, 365, 300, 70), yellowInk, 18),
    stroke("crown-points", [
      [340, 365],
      [380, 210],
      [455, 365],
      [480, 190],
      [505, 365],
      [580, 210],
      [620, 365],
    ], yellowInk, 18),
    stroke("crown-gems", [
      [380, 395],
      [385, 395],
      [480, 395],
      [485, 395],
      [580, 395],
      [585, 395],
    ], accentInk, 16),
  ]),
] satisfies DrawDuelAIBenchmarkFixture[];
