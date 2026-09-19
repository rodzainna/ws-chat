import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  gql,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { Observable } from "@apollo/client/utilities";

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

const refreshListeners = new Set<() => void>();
export function onSessionRefreshed(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

const REFRESH_BUFFER_MS = 60_000;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleProactiveRefresh(expiresAtMs: number): void {
  clearTimeout(refreshTimer);
  const delay = Math.max(expiresAtMs - Date.now() - REFRESH_BUFFER_MS, 0);
  refreshTimer = setTimeout(() => {
    void attemptRefresh();
  }, delay);
}

export function cancelProactiveRefresh(): void {
  clearTimeout(refreshTimer);
}

const REFRESH_MUTATION = gql`
  mutation RefreshOnAuthError {
    refresh {
      user {
        id
      }
      accessTokenExpiresAt
      userErrors {
        message
      }
    }
  }
`;

// concurrent 401s share one in-flight refresh
let refreshPromise: Promise<boolean> | null = null;

export function attemptRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = apolloClient
      .mutate<{
        refresh: {
          user: { id: string } | null;
          accessTokenExpiresAt: string | null;
          userErrors: unknown[];
        };
      }>({
        mutation: REFRESH_MUTATION,
        fetchPolicy: "no-cache",
      })
      .then((result) => {
        const { user, accessTokenExpiresAt } = result.data?.refresh ?? {};
        if (!user || !accessTokenExpiresAt) return false;
        scheduleProactiveRefresh(new Date(accessTokenExpiresAt).getTime());
        for (const listener of refreshListeners) listener();
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const errorLink = onError(({ graphQLErrors, operation, forward }) => {
  const isAuthError = graphQLErrors?.some(
    (err) => err.extensions?.code === "UNAUTHENTICATED",
  );
  if (!isAuthError) return;

  return new Observable((observer) => {
    attemptRefresh()
      .then((refreshed) => {
        if (!refreshed) {
          onSessionExpired?.();
          observer.error(graphQLErrors?.[0]);
          return;
        }
        forward(operation).subscribe({
          next: (value) => observer.next(value),
          error: (err: unknown) => observer.error(err),
          complete: () => observer.complete(),
        });
      })
      .catch((err: unknown) => observer.error(err));
  });
});

const httpLink = new HttpLink({
  uri: "/graphql",
  credentials: "include",
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, httpLink]),
  cache: new InMemoryCache(),
});
