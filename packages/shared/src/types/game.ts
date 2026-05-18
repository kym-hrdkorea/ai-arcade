export type GameCapability =
  | "realtime"
  | "drawing"
  | "chat"
  | "voice"
  | "image-ai"
  | "text-ai"
  | "team-play"
  | "host-mode";

export type GameGuideSlide = {
  title: string;
  body: string;
  items: readonly string[];
};

export type GameGuide = {
  slides: readonly GameGuideSlide[];
};

export type GameModuleMeta = {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  thumbnail: string;
  route: string;
  status: "draft" | "beta" | "stable";
  tags: readonly string[];
  requiredCapabilities: readonly GameCapability[];
  guide: GameGuide;
};
