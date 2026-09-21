import { useState, type FormEvent } from "react";
import { NavLink, useMatches, useNavigate } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
import { ChevronRightIcon } from "lucide-react";
import { ROOMS_QUERY } from "@/graphql/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoomLabel } from "@/components/RoomLabel";
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
import { useRoomActivity } from "@/ws/useRoomActivity";

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

export function RoomSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // the sidebar sits outside the /rooms/:roomId match, so useParams() can't
  // see roomId
  const matches = useMatches();
  const activeRoomId =
    (matches.find((match) => match.params.roomId)?.params.roomId as string) ??
    null;
  const activity = useRoomActivity(activeRoomId);
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
    onClose();
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
    onClose();
    void navigate(`/rooms/${payload.room.id}`);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r bg-background transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {canCreate && (
          <div className="flex h-12 items-center border-b p-2">
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
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          )}
          {error && (
            <p className="p-2 text-sm text-destructive">
              Failed to load rooms.
            </p>
          )}
          {joinError && (
            <p className="p-2 text-sm text-destructive">{joinError}</p>
          )}

          {memberRooms.map((room) => {
            const roomActivity = activity[room.id];
            return (
              <NavLink
                key={room.id}
                to={`/rooms/${room.id}`}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    isActive && "bg-muted font-medium",
                  )
                }
              >
                <span className="min-w-0 flex-1 truncate">
                  <RoomLabel isPrivate={room.isPrivate} name={room.name} />
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {room.isPrivate && <Badge variant="secondary">Private</Badge>}
                  {roomActivity && (
                    <Badge
                      className={cn(
                        roomActivity.hasUnreadMention &&
                          "bg-amber-400 text-amber-950",
                      )}
                    >
                      {roomActivity.unreadCount}
                    </Badge>
                  )}
                </span>
              </NavLink>
            );
          })}

          {memberRooms.length === 0 && !canJoin && (
            <p className="p-2 text-sm text-muted-foreground">
              You haven't been added to any rooms yet.
            </p>
          )}
          {memberRooms.length === 0 && canJoin && otherRooms.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No rooms yet — create one to get started.
            </p>
          )}

          {canJoin && otherRooms.length > 0 && (
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
                      <span className="min-w-0 flex-1 truncate">
                        <RoomLabel
                          isPrivate={room.isPrivate}
                          name={room.name}
                        />
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={joining}
                        onClick={() => void handleJoin(room)}
                      >
                        Join
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
