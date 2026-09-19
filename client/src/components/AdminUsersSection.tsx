import { useState } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/useAuth";

type GlobalRole = "ADMIN" | "USER" | "RESTRICTED";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  globalRole: GlobalRole;
  isActive: boolean;
  createdAt: string;
};

type UserError = { field: string[]; message: string };
type RowActionPayload = { user: AdminUser | null; userErrors: UserError[] };

type UsersQueryResult = {
  users: {
    edges: { cursor: string; node: AdminUser }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const PAGE_SIZE = 20;

const USERS_QUERY = gql`
  query AdminUsers($first: Int, $after: String) {
    users(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          username
          email
          globalRole
          isActive
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

const SET_GLOBAL_ROLE_MUTATION = gql`
  mutation SetGlobalRole($userId: ID!, $role: GlobalRole!) {
    setGlobalRole(userId: $userId, role: $role) {
      user {
        id
        globalRole
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE_USER_MUTATION = gql`
  mutation DeactivateUser($userId: ID!) {
    deactivateUser(userId: $userId) {
      user {
        id
        isActive
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ROLES: GlobalRole[] = ["ADMIN", "USER", "RESTRICTED"];

export function AdminUsersSection() {
  const { user: currentUser } = useAuth();
  const { data, loading, error, fetchMore } = useQuery<UsersQueryResult>(
    USERS_QUERY,
    { variables: { first: PAGE_SIZE } },
  );
  const [setGlobalRole] = useMutation<
    {
      setGlobalRole: { user: AdminUser | null; userErrors: UserError[] };
    },
    { userId: string; role: GlobalRole }
  >(SET_GLOBAL_ROLE_MUTATION);
  const [deactivateUser] = useMutation<
    {
      deactivateUser: { user: AdminUser | null; userErrors: UserError[] };
    },
    { userId: string }
  >(DEACTIVATE_USER_MUTATION);

  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [optimisticRoles, setOptimisticRoles] = useState<
    Record<string, GlobalRole>
  >({});

  function addPending(userId: string) {
    setPendingUserIds((prev) => new Set(prev).add(userId));
  }
  function removePending(userId: string) {
    setPendingUserIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }

  async function runRowAction(
    userId: string,
    mutate: () => Promise<RowActionPayload | undefined>,
    fallbackMessage: string,
  ) {
    addPending(userId);
    setRowErrors((prev) => ({ ...prev, [userId]: "" }));
    try {
      const payload = await mutate();
      if (!payload?.user) {
        setRowErrors((prev) => ({
          ...prev,
          [userId]: payload?.userErrors[0]?.message ?? fallbackMessage,
        }));
      }
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [userId]: `${fallbackMessage} — you may no longer be an admin`,
      }));
    } finally {
      removePending(userId);
    }
  }

  async function handleRoleChange(userId: string, role: GlobalRole) {
    setOptimisticRoles((prev) => ({ ...prev, [userId]: role }));
    await runRowAction(
      userId,
      async () =>
        (await setGlobalRole({ variables: { userId, role } })).data
          ?.setGlobalRole,
      "Could not change role",
    );
    setOptimisticRoles((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  async function handleDeactivate(userId: string) {
    await runRowAction(
      userId,
      async () =>
        (await deactivateUser({ variables: { userId } })).data?.deactivateUser,
      "Could not deactivate",
    );
  }

  async function handleLoadMore() {
    const pageInfo = data?.users.pageInfo;
    if (!pageInfo?.hasNextPage) return;
    setLoadingMore(true);
    await fetchMore({
      variables: { first: PAGE_SIZE, after: pageInfo.endCursor },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          users: {
            ...fetchMoreResult.users,
            edges: [...prev.users.edges, ...fetchMoreResult.users.edges],
          },
        };
      },
    });
    setLoadingMore(false);
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading users…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load users.</p>;
  }

  const edges = data?.users.edges ?? [];

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-lg border">
        {edges.map(({ node: u }) => {
          const isSelf = u.id === currentUser?.id;
          const isPending = pendingUserIds.has(u.id);
          const displayedRole = optimisticRoles[u.id] ?? u.globalRole;
          return (
            <div key={u.id} className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.username}</span>
                {isSelf && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
                <span className="text-sm text-muted-foreground">{u.email}</span>
                <Badge
                  variant={u.isActive ? "secondary" : "destructive"}
                  className="ml-auto"
                >
                  {u.isActive ? "Active" : "Deactivated"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={displayedRole}
                  disabled={isPending}
                  onValueChange={(value) =>
                    void handleRoleChange(u.id, value as GlobalRole)
                  }
                >
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!u.isActive || isPending}
                  onClick={() => void handleDeactivate(u.id)}
                >
                  Deactivate
                </Button>
              </div>
              {rowErrors[u.id] && (
                <p className="text-xs text-destructive">{rowErrors[u.id]}</p>
              )}
            </div>
          );
        })}
        {edges.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No users found.</p>
        )}
      </div>
      {data?.users.pageInfo.hasNextPage && (
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
