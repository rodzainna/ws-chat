import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { gql, useApolloClient } from "@apollo/client";

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

type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  refetchUser: () => Promise<void>;
  clearUser: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useApolloClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchUser = useCallback(async () => {
    await client.clearStore();
    const { data } = await client.query<{ me: CurrentUser | null }>({
      query: ME_QUERY,
      fetchPolicy: "network-only",
    });
    setUser(data.me);
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
