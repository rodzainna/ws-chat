import { Navigate } from "react-router";
import { useQuery } from "@apollo/client";
import { ROOMS_QUERY } from "@/graphql/queries";

type Room = { id: string; isMember: boolean };

export function NoRoomSelected() {
  const { data, loading, error } = useQuery<{ rooms: Room[] }>(ROOMS_QUERY);

  const firstOwnRoom = data?.rooms.find((room) => room.isMember);

  if (firstOwnRoom) {
    return <Navigate to={`/rooms/${firstOwnRoom.id}`} replace />;
  }

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {loading
        ? "Loading…"
        : error
          ? "Failed to load rooms."
          : "Select a room from the sidebar, or create one."}
    </div>
  );
}
