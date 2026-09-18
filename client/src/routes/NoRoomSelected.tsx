import { Navigate } from "react-router";
import { useQuery } from "@apollo/client";
import { ROOMS_QUERY } from "@/components/RoomSidebar";

type Room = { id: string; isMember: boolean };

export function NoRoomSelected() {
  const { data, loading } = useQuery<{ rooms: Room[] }>(ROOMS_QUERY);

  const firstOwnRoom = data?.rooms.find((room) => room.isMember);

  if (firstOwnRoom) {
    return <Navigate to={`/rooms/${firstOwnRoom.id}`} replace />;
  }

  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      {loading ? "Loading…" : "Select a room from the sidebar, or create one."}
    </div>
  );
}
