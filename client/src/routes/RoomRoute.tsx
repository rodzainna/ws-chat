import { useParams } from "react-router";
import { RoomPage } from "@/routes/RoomPage";

// keyed by roomId so switching rooms remounts RoomPage and its state
export function RoomRoute() {
  const { roomId } = useParams<{ roomId: string }>();
  return <RoomPage key={roomId} />;
}
