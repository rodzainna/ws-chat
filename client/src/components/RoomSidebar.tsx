import { useState, type FormEvent } from "react";
import { NavLink, useNavigate } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
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
import { useAuth } from "@/auth/AuthContext";

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

export const ROOMS_QUERY = gql`
  query Rooms {
    rooms {
      id
      name
      isPrivate
      isMember
    }
  }
`;

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

  async function handleRoomClick(room: Room) {
    if (room.isMember) {
      void navigate(`/rooms/${room.id}`);
      return;
    }
    if (!canJoin) {
      setJoinError("Restricted users can't join rooms directly.");
      return;
    }

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

        {data?.rooms.map((room) => {
          const disabled = !room.isMember && !canJoin;
          return room.isMember ? (
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
          ) : (
            <button
              key={room.id}
              type="button"
              disabled={disabled || joining}
              onClick={() => void handleRoomClick(room)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted",
                disabled &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <span className="truncate"># {room.name}</span>
              {!disabled && (
                <span className="ml-auto shrink-0 text-xs">Join</span>
              )}
            </button>
          );
        })}

        {data?.rooms.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            No rooms yet — create one to get started.
          </p>
        )}
      </div>
    </aside>
  );
}
