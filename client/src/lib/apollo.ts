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

const REFRESH_MUTATION = gql`
  mutation RefreshOnAuthError {
    refresh {
      user {
        id
      }
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
        refresh: { user: { id: string } | null; userErrors: unknown[] };
      }>({
        mutation: REFRESH_MUTATION,
        fetchPolicy: "no-cache",
      })
      .then((result) => Boolean(result.data?.refresh.user))
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
