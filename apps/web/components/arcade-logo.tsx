type ArcadeLogoProps = {
  compact?: boolean;
};

export function ArcadeLogo({ compact = false }: ArcadeLogoProps) {
  return (
    <div className={compact ? "leading-none" : undefined}>
      <p className="font-arcade text-[0.55rem] uppercase tracking-[0.18em] text-electric-cyan sm:text-[0.65rem]">
        INSERT COIN
      </p>
      <h1
        className={`mt-2 font-arcade leading-tight text-coin-yellow drop-shadow-[3px_3px_0_#0b1020] [text-shadow:0_0_18px_rgb(250_204_21_/_0.28),2px_2px_0_#22d3ee] ${
          compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-4xl lg:text-5xl"
        }`}
        data-testid="arcade-logo-title"
      >
        AI Arcade
      </h1>
    </div>
  );
}
