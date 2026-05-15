import type { GameModuleMeta } from "@ai-arcade/shared";
import { Clock3, Gamepad2, Play, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type GameCardProps = {
  game: GameModuleMeta;
};

const statusLabel: Record<GameModuleMeta["status"], string> = {
  draft: "준비 중",
  beta: "베타",
  stable: "안정",
};

export function GameCard({ game }: GameCardProps) {
  return (
    <article className="group flex min-h-[460px] flex-col border-2 border-line-gray bg-panel-gray p-4 shadow-panel transition hover:border-electric-cyan">
      <div className="relative aspect-[16/10] overflow-hidden border-2 border-line-gray bg-console-black">
        <Image
          alt={`${game.title} 썸네일`}
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
          fill
          priority
          src={game.thumbnail}
          unoptimized
        />
      </div>

      <div className="flex flex-1 flex-col pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="arcade-badge arcade-badge-cyan">
              {statusLabel[game.status]}
            </span>
            <h3 className="mt-2 text-2xl font-black text-screen-white">
              {game.title}
            </h3>
          </div>
          <Gamepad2 aria-hidden="true" className="text-coin-yellow" size={28} />
        </div>

        <p className="mt-4 flex-1 text-base leading-7 text-muted-gray">
          {game.shortDescription}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {game.tags.map((tag) => (
            <span className="arcade-badge" key={tag}>
              #{tag}
            </span>
          ))}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm text-screen-white">
          <div className="flex items-center gap-2 border border-line-gray bg-console-black px-3 py-2">
            <Users aria-hidden="true" className="text-pixel-blue" size={18} />
            <span>
              {game.minPlayers}-{game.maxPlayers}명
            </span>
          </div>
          <div className="flex items-center gap-2 border border-line-gray bg-console-black px-3 py-2">
            <Clock3 aria-hidden="true" className="text-health-green" size={18} />
            <span>{game.estimatedMinutes}분</span>
          </div>
        </dl>

        <Link className="arcade-button arcade-button-primary mt-5" href={game.route}>
          <Play aria-hidden="true" size={18} />
          시작
        </Link>
      </div>
    </article>
  );
}
