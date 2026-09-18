import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const ROOMS_QUERY = gql`
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

export function RoomsPage() {
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
    await refetch();
    void navigate(`/rooms/${payload.room.id}`);
  }

  async function handleJoin(roomId: string) {
    setJoinError(null);
    const result = await joinRoom({ variables: { roomId } });
    const payload = result.data?.joinRoom;
    if (!payload?.room) {
      setJoinError(payload?.userErrors?.[0]?.message ?? "Could not join room");
      return;
    }
    await refetch();
    void navigate(`/rooms/${payload.room.id}`);
  }

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Rooms</h1>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create room</Button>
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

        {joinError && <p className="text-sm text-destructive">{joinError}</p>}

        {loading && <p className="text-muted-foreground">Loading rooms…</p>}
        {error && <p className="text-destructive">Failed to load rooms.</p>}

        <div className="space-y-2">
          {data?.rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  {room.name}
                  {room.isPrivate && <Badge variant="secondary">Private</Badge>}
                </CardTitle>
                {room.isMember ? (
                  <Button
                    size="sm"
                    onClick={() => void navigate(`/rooms/${room.id}`)}
                  >
                    Open
                  </Button>
                ) : (
                  canJoin && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={joining}
                      onClick={() => void handleJoin(room.id)}
                    >
                      Join
                    </Button>
                  )
                )}
              </CardHeader>
            </Card>
          ))}
          {data?.rooms.length === 0 && (
            <CardContent className="text-muted-foreground">
              No rooms yet — create one to get started.
            </CardContent>
          )}
        </div>
      </main>
    </div>
  );
}
