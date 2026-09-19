import { useState } from "react";
import { gql, useApolloClient, useMutation } from "@apollo/client";
import { Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminPagination } from "@/components/AdminPagination";
import { usePagedConnection } from "@/hooks/usePagedConnection";

type AdminRoom = {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  createdAt: string;
};

type UserError = { field: string[]; message: string };

type AdminRoomsQueryResult = {
  adminRooms: {
    edges: { cursor: string; node: AdminRoom }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  };
};

const PAGE_SIZE = 10;

const ADMIN_ROOMS_QUERY = gql`
  query AdminRooms($first: Int, $after: String) {
    adminRooms(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          name
          isPrivate
          isMember
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

const DELETE_ROOM_MUTATION = gql`
  mutation AdminDeleteRoom($roomId: ID!) {
    deleteRoom(roomId: $roomId) {
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

export function AdminRoomsSection() {
  const client = useApolloClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    items: rooms,
    currentPage,
    totalPages,
    setCurrentPage,
    loading,
    error,
  } = usePagedConnection<AdminRoom>(
    async (after) => {
      const result = await client.query<AdminRoomsQueryResult>({
        query: ADMIN_ROOMS_QUERY,
        variables: { first: PAGE_SIZE, after },
        fetchPolicy: "network-only",
      });
      return result.data.adminRooms;
    },
    PAGE_SIZE,
    refreshKey,
  );

  const [deleteRoom] = useMutation<
    { deleteRoom: { room: { id: string } | null; userErrors: UserError[] } },
    { roomId: string }
  >(DELETE_ROOM_MUTATION);

  const [pendingRoomIds, setPendingRoomIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function addPending(roomId: string) {
    setPendingRoomIds((prev) => new Set(prev).add(roomId));
  }
  function removePending(roomId: string) {
    setPendingRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
  }

  async function handleDelete(roomId: string) {
    addPending(roomId);
    setRowErrors((prev) => ({ ...prev, [roomId]: "" }));
    try {
      const result = await deleteRoom({ variables: { roomId } });
      const payload = result.data?.deleteRoom;
      if (!payload?.room) {
        setRowErrors((prev) => ({
          ...prev,
          [roomId]: payload?.userErrors[0]?.message ?? "Could not delete room",
        }));
        return;
      }
      setRefreshKey((key) => key + 1);
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [roomId]: "Could not delete room — you may no longer be an admin",
      }));
    } finally {
      removePending(roomId);
    }
  }

  if (loading && rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading rooms…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load rooms.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-lg border">
        {rooms.map((r) => {
          const isPending = pendingRoomIds.has(r.id);
          return (
            <div key={r.id} className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium"># {r.name}</span>
                {r.isPrivate && <Badge variant="secondary">Private</Badge>}
                {r.isMember && (
                  <span className="text-xs text-muted-foreground">
                    (you're a member)
                  </span>
                )}
                <AlertDialog
                  open={confirmDeleteId === r.id}
                  onOpenChange={(open) =>
                    setConfirmDeleteId(open ? r.id : null)
                  }
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="ml-auto"
                      disabled={isPending}
                    >
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete #{r.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Members will be disconnected and it disappears from
                        everyone's room list. This can't be undone from here.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleDelete(r.id).then(() =>
                            setConfirmDeleteId(null),
                          );
                        }}
                      >
                        {isPending ? (
                          <>
                            <Loader2Icon className="animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          "Delete"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {rowErrors[r.id] && (
                <p className="text-xs text-destructive">{rowErrors[r.id]}</p>
              )}
            </div>
          );
        })}
        {rooms.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No rooms found.</p>
        )}
      </div>
      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
