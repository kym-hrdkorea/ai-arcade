import { DrawDuelRoomScreen } from "@/features/draw-duel/draw-duel-room-screen";

type AdminRoomPageProps = {
  params: Promise<{
    roomCode: string;
  }>;
};

export default async function AdminRoomPage({ params }: AdminRoomPageProps) {
  const { roomCode } = await params;

  return <DrawDuelRoomScreen mode="admin" roomCode={roomCode} />;
}
