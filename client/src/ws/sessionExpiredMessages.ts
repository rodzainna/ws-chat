const LOGGED_OUT_MESSAGE = "You've been logged out.";

// not navigate() state: ProtectedRoute's own <Navigate replace> would wipe
// it. LoginPage reads this once on mount.
let pendingMessage: string | null = null;
let pendingReturnTo: string | null = null;

export function consumePendingSessionExpiredMessage(): string | null {
  const message = pendingMessage;
  pendingMessage = null;
  return message;
}

export function consumePendingReturnTo(): string | null {
  const returnTo = pendingReturnTo;
  pendingReturnTo = null;
  return returnTo;
}

type NavigateFn = (
  path: string,
  options?: { replace?: boolean },
) => void | Promise<void>;

export function expireSession(
  navigate: NavigateFn,
  clearUser: () => void,
): void {
  pendingMessage = LOGGED_OUT_MESSAGE;
  pendingReturnTo = window.location.pathname + window.location.search;
  clearUser();
  void navigate("/login", { replace: true });
}
