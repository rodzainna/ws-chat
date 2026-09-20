export const SESSION_EXPIRED_MESSAGES: Record<string, string> = {
  deactivated: "Your account has been deactivated.",
  token_expired: "Your session expired — reload the page to log back in.",
  logged_out: "You've been logged out.",
};
export const DEFAULT_SESSION_EXPIRED_MESSAGE =
  "Your session has ended — reload the page.";

let pendingMessage: string | null = null;

export function setPendingSessionExpiredMessage(message: string): void {
  pendingMessage = message;
}

export function consumePendingSessionExpiredMessage(): string | null {
  const message = pendingMessage;
  pendingMessage = null;
  return message;
}
