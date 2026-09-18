import { useCallback, useEffect, useState, type ReactNode } from "react";
import { gql, useApolloClient } from "@apollo/client";
import { attemptRefresh } from "@/lib/apollo";
import { AuthContext } from "./useAuth";

export type GlobalRole = "ADMIN" | "USER" | "RESTRICTED";

export type CurrentUser = {
  id: string;
  username: string;
  email: string;
  globalRole: GlobalRole;
  isActive: boolean;
};

const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      email
      globalRole
      isActive
    }
  }
`;

export type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  refetchUser: () => Promise<void>;
  clearUser: () => void;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useApolloClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchUser = useCallback(async () => {
    // the cache isn't keyed by user, so a new login mustn't see the old one's
    await client.clearStore();
    const { data } = await client.query<{ me: CurrentUser | null }>({
      query: ME_QUERY,
      fetchPolicy: "network-only",
    });
    if (data.me) {
      setUser(data.me);
      return;
    }

    // a null /me usually just means the access token expired. me returns
    // null rather than throwing, so the error link won't refresh; do it here.
    const refreshed = await attemptRefresh();
    if (!refreshed) {
      setUser(null);
      return;
    }
    const { data: afterRefresh } = await client.query<{
      me: CurrentUser | null;
    }>({
      query: ME_QUERY,
      fetchPolicy: "network-only",
    });
    setUser(afterRefresh.me);
  }, [client]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetchUser().finally(() => setLoading(false));
  }, [refetchUser]);

  const clearUser = useCallback(() => {
    setUser(null);
    void client.clearStore();
  }, [client]);

  return (
    <AuthContext.Provider value={{ user, loading, refetchUser, clearUser }}>
      {children}
    </AuthContext.Provider>
  );
}
