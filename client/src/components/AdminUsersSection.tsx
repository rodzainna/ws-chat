import { useState } from "react";
import { gql, useApolloClient, useMutation } from "@apollo/client";
import { Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    totalCount: number;
  };
};

const PAGE_SIZE = 10;

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
      totalCount
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

const REACTIVATE_USER_MUTATION = gql`
  mutation ReactivateUser($userId: ID!) {
    reactivateUser(userId: $userId) {
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
  const client = useApolloClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    items: users,
    currentPage,
    totalPages,
    setCurrentPage,
    loading,
    error,
  } = usePagedConnection<AdminUser>(
    async (after) => {
      const result = await client.query<UsersQueryResult>({
        query: USERS_QUERY,
        variables: { first: PAGE_SIZE, after },
        fetchPolicy: "network-only",
      });
      return result.data.users;
    },
    PAGE_SIZE,
    refreshKey,
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
  const [reactivateUser] = useMutation<
    {
      reactivateUser: { user: AdminUser | null; userErrors: UserError[] };
    },
    { userId: string }
  >(REACTIVATE_USER_MUTATION);

  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [optimisticRoles, setOptimisticRoles] = useState<
    Record<string, GlobalRole>
  >({});
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(
    null,
  );

  const [prevUsers, setPrevUsers] = useState(users);
  if (users !== prevUsers) {
    setPrevUsers(users);
    setOptimisticRoles((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const u of users) {
        if (u.id in next && next[u.id] === u.globalRole) {
          delete next[u.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

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
    onSettled?: (succeeded: boolean) => void,
  ) {
    addPending(userId);
    setRowErrors((prev) => ({ ...prev, [userId]: "" }));
    let succeeded = false;
    try {
      const payload = await mutate();
      if (!payload?.user) {
        setRowErrors((prev) => ({
          ...prev,
          [userId]: payload?.userErrors[0]?.message ?? fallbackMessage,
        }));
      } else {
        succeeded = true;
        setRefreshKey((key) => key + 1);
      }
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [userId]: `${fallbackMessage} — you may no longer be an admin`,
      }));
    } finally {
      removePending(userId);
      onSettled?.(succeeded);
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
      (succeeded) => {
        if (!succeeded) {
          setOptimisticRoles((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }
      },
    );
  }

  async function handleDeactivate(userId: string) {
    await runRowAction(
      userId,
      async () =>
        (await deactivateUser({ variables: { userId } })).data?.deactivateUser,
      "Could not deactivate",
    );
  }

  async function handleReactivate(userId: string) {
    await runRowAction(
      userId,
      async () =>
        (await reactivateUser({ variables: { userId } })).data?.reactivateUser,
      "Could not reactivate",
    );
  }

  if (loading && users.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading users…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load users.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-lg border">
        {users.map((u) => {
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
                {u.isActive ? (
                  <AlertDialog
                    open={confirmDeactivateId === u.id}
                    onOpenChange={(open) =>
                      setConfirmDeactivateId(open ? u.id : null)
                    }
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                      >
                        Deactivate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Deactivate {u.username}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          They'll be signed out and unable to log back in until
                          reactivated.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={isPending}
                          onClick={(event) => {
                            event.preventDefault();
                            void handleDeactivate(u.id).then(() =>
                              setConfirmDeactivateId(null),
                            );
                          }}
                        >
                          {isPending ? (
                            <>
                              <Loader2Icon className="animate-spin" />
                              Deactivating…
                            </>
                          ) : (
                            "Deactivate"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => void handleReactivate(u.id)}
                  >
                    {isPending ? (
                      <>
                        <Loader2Icon className="animate-spin" />
                        Reactivating…
                      </>
                    ) : (
                      "Reactivate"
                    )}
                  </Button>
                )}
              </div>
              {rowErrors[u.id] && (
                <p className="text-xs text-destructive">{rowErrors[u.id]}</p>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No users found.</p>
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
