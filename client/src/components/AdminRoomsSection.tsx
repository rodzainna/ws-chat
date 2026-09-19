import { useState } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  };
};

const PAGE_SIZE = 20;

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
  const { data, loading, error, fetchMore, refetch } =
    useQuery<AdminRoomsQueryResult>(ADMIN_ROOMS_QUERY, {
      variables: { first: PAGE_SIZE },
    });
  const [deleteRoom] = useMutation<
    { deleteRoom: { room: { id: string } | null; userErrors: UserError[] } },
    { roomId: string }
  >(DELETE_ROOM_MUTATION);

  const [pendingRoomIds, setPendingRoomIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState(false);

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
      await refetch();
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [roomId]: "Could not delete room — you may no longer be an admin",
      }));
    } finally {
      removePending(roomId);
    }
  }

  async function handleLoadMore() {
    const pageInfo = data?.adminRooms.pageInfo;
    if (!pageInfo?.hasNextPage) return;
    setLoadingMore(true);
    await fetchMore({
      variables: { first: PAGE_SIZE, after: pageInfo.endCursor },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          adminRooms: {
            ...fetchMoreResult.adminRooms,
            edges: [
              ...prev.adminRooms.edges,
              ...fetchMoreResult.adminRooms.edges,
            ],
          },
        };
      },
    });
    setLoadingMore(false);
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading rooms…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load rooms.</p>;
  }

  const edges = data?.adminRooms.edges ?? [];

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-lg border">
        {edges.map(({ node: r }) => {
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
                <Button
                  size="sm"
                  variant="destructive"
                  className="ml-auto"
                  disabled={isPending}
                  onClick={() => void handleDelete(r.id)}
                >
                  Delete
                </Button>
              </div>
              {rowErrors[r.id] && (
                <p className="text-xs text-destructive">{rowErrors[r.id]}</p>
              )}
            </div>
          );
        })}
        {edges.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No rooms found.</p>
        )}
      </div>
      {data?.adminRooms.pageInfo.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={() => void handleLoadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
