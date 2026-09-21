import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  gql,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { Observable } from "@apollo/client/utilities";

const refreshListeners = new Set<() => void>();
export function onSessionRefreshed(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

const REFRESH_BUFFER_MS = 60_000;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let scheduledRefreshAt: number | null = null;

export function scheduleProactiveRefresh(expiresAtMs: number): void {
  clearTimeout(refreshTimer);
  const delay = Math.max(expiresAtMs - Date.now() - REFRESH_BUFFER_MS, 0);
  scheduledRefreshAt = Date.now() + delay;
  refreshTimer = setTimeout(() => {
    void attemptRefresh();
  }, delay);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (scheduledRefreshAt !== null && Date.now() >= scheduledRefreshAt) {
    void attemptRefresh();
  }
});

export type ReauthState = { active: boolean; message: string };
const INACTIVE_REAUTH_STATE: ReauthState = { active: false, message: "" };
let reauthState: ReauthState = INACTIVE_REAUTH_STATE;
const reauthListeners = new Set<(state: ReauthState) => void>();

function setReauthState(next: ReauthState): void {
  reauthState = next;
  for (const listener of reauthListeners) listener(next);
}

export function subscribeReauthState(
  listener: (state: ReauthState) => void,
): () => void {
  listener(reauthState);
  reauthListeners.add(listener);
  return () => reauthListeners.delete(listener);
}

const REAUTH_RETRY_INTERVAL_MS = 10_000;
let reauthRetryTimer: ReturnType<typeof setInterval> | undefined;

export function beginReauthRecovery(message: string): void {
  setReauthState({ active: true, message });
  if (reauthRetryTimer) return;
  reauthRetryTimer = setInterval(() => {
    void attemptRefresh().then((refreshed) => {
      if (refreshed) stopReauthRecovery();
    });
  }, REAUTH_RETRY_INTERVAL_MS);
}

function stopReauthRecovery(): void {
  clearInterval(reauthRetryTimer);
  reauthRetryTimer = undefined;
  setReauthState(INACTIVE_REAUTH_STATE);
}

export function cancelProactiveRefresh(): void {
  clearTimeout(refreshTimer);
  scheduledRefreshAt = null;
  stopReauthRecovery();
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
          beginReauthRecovery("Reconnecting…");
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
