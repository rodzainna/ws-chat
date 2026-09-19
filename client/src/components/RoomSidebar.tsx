import { useState, type FormEvent } from "react";
import { NavLink, useNavigate } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
import { ChevronRightIcon } from "lucide-react";
import { ROOMS_QUERY } from "@/graphql/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/useAuth";

type Room = {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
};

type UserError = { field: string[]; message: string };
type RoomMutationPayload = {
  room: { id: string } | null;
  userErrors: UserError[];
};

const CREATE_ROOM_MUTATION = gql`
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      room {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const JOIN_ROOM_MUTATION = gql`
  mutation JoinRoom($roomId: ID!) {
    joinRoom(roomId: $roomId) {
      room {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export function RoomSidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery<{ rooms: Room[] }>(
    ROOMS_QUERY,
  );
  const sortedRooms = [...(data?.rooms ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const memberRooms = sortedRooms.filter((room) => room.isMember);
  const otherRooms = sortedRooms.filter((room) => !room.isMember);

  const [createRoom, { loading: creating }] = useMutation<
    { createRoom: RoomMutationPayload },
    { input: { name: string; isPrivate: boolean } }
  >(CREATE_ROOM_MUTATION);
  const [joinRoom, { loading: joining }] = useMutation<
    { joinRoom: RoomMutationPayload },
    { roomId: string }
  >(JOIN_ROOM_MUTATION);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [createErrors, setCreateErrors] = useState<UserError[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [otherRoomsOpen, setOtherRoomsOpen] = useState(false);

  const canCreate = user?.globalRole !== "RESTRICTED";
  const canJoin = user?.globalRole !== "RESTRICTED";

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateErrors([]);

    const result = await createRoom({
      variables: { input: { name, isPrivate } },
    });
    const payload = result.data?.createRoom;
    if (!payload?.room) {
      setCreateErrors(payload?.userErrors ?? []);
      return;
    }

    setDialogOpen(false);
    setName("");
    setIsPrivate(false);
    await refetch().catch(() => {});
    void navigate(`/rooms/${payload.room.id}`);
  }

  async function handleJoin(room: Room) {
    setJoinError(null);
    const result = await joinRoom({ variables: { roomId: room.id } });
    const payload = result.data?.joinRoom;
    if (!payload?.room) {
      setJoinError(payload?.userErrors?.[0]?.message ?? "Could not join room");
      return;
    }
    await refetch().catch(() => {});
    void navigate(`/rooms/${payload.room.id}`);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r">
      <div className="border-b p-3">
        {canCreate && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">Create room</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a room</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(event) => void handleCreate(event)}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="room-name">Name</Label>
                  <Input
                    id="room-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="room-private"
                    checked={isPrivate}
                    onCheckedChange={(checked) =>
                      setIsPrivate(checked === true)
                    }
                  />
                  <Label htmlFor="room-private">Private room</Label>
                </div>
                {createErrors.length > 0 && (
                  <ul className="space-y-1 text-sm text-destructive">
                    {createErrors.map((err, index) => (
                      <li key={index}>{err.message}</li>
                    ))}
                  </ul>
                )}
                <Button type="submit" className="w-full" disabled={creating}>
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        )}
        {error && (
          <p className="p-2 text-sm text-destructive">Failed to load rooms.</p>
        )}
        {joinError && (
          <p className="p-2 text-sm text-destructive">{joinError}</p>
        )}

        {memberRooms.map((room) => (
          <NavLink
            key={room.id}
            to={`/rooms/${room.id}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                isActive && "bg-muted font-medium",
              )
            }
          >
            <span className="truncate"># {room.name}</span>
            {room.isPrivate && (
              <Badge variant="secondary" className="ml-auto shrink-0">
                Private
              </Badge>
            )}
          </NavLink>
        ))}

        {memberRooms.length === 0 && otherRooms.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            No rooms yet — create one to get started.
          </p>
        )}

        {otherRooms.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOtherRoomsOpen((open) => !open)}
              aria-expanded={otherRoomsOpen}
              className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  otherRoomsOpen && "rotate-90",
                )}
              />
              <span className="truncate">
                Other channels ({otherRooms.length})
              </span>
            </button>
            {otherRoomsOpen && (
              <div className="mt-1">
                {otherRooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
                  >
                    <span className="truncate"># {room.name}</span>
                    {canJoin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto shrink-0"
                        disabled={joining}
                        onClick={() => void handleJoin(room)}
                      >
                        Join
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
