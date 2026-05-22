import { DrawDuelRoomScreen } from "@/features/draw-duel/draw-duel-room-screen";

type ScreenRoomPageProps = {
  params: Promise<{
    roomCode: string;
  }>;
};

export default async function ScreenRoomPage({ params }: ScreenRoomPageProps) {
  const { roomCode } = await params;

  return <DrawDuelRoomScreen mode="screen" roomCode={roomCode} />;
}
