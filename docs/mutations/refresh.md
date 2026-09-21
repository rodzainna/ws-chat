# `refresh`

Rotates the session: exchanges the current refresh token for a fresh access + refresh pair.

## Definition

```graphql
type Mutation {
  refresh: RefreshPayload!
}

type RefreshPayload {
  user: User
  accessTokenExpiresAt: DateTime
  userErrors: [UserError!]!
}
```

No arguments — the refresh token is read from the request's cookie, same as every other auth-aware request.

## Auth

Requires a valid refresh token cookie (set by [`login`](./login.md)/[`register`](./register.md)). Not "authenticated" in the usual sense — a request with only an _expired_ access token but a still-valid refresh token is exactly the intended caller for this mutation.

## userErrors

| Field | Message                                              | Condition                                                                                                                                                                                                                                                            |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[]`  | `"Session expired or invalid. Please log in again."` | One generic message covers every failure branch: no cookie present, refresh token expired, already-rotated (reuse), or the account has since been deactivated — see Notes for why what happens to the cookie behind that identical message isn't actually identical. |

## Example

```graphql
mutation Refresh {
  refresh {
    user {
      id
      username
    }
    accessTokenExpiresAt
    userErrors {
      message
    }
  }
}
```

Success:

```json
{
  "data": {
    "refresh": {
      "user": { "id": "01J...D", "username": "dave" },
      "accessTokenExpiresAt": "2026-09-21T15:02:00.000Z",
      "userErrors": []
    }
  }
}
```

Expired/invalid session:

```json
{
  "data": {
    "refresh": {
      "user": null,
      "accessTokenExpiresAt": null,
      "userErrors": [
        { "message": "Session expired or invalid. Please log in again." }
      ]
    }
  }
}
```

## Notes

- **Atomic rotation.** The mutation validates the refresh token, atomically _claims_ it for rotation (so two concurrent refresh calls with the same token can't both succeed and each think they hold the "current" one), and issues a brand-new access+refresh pair. The old refresh token stops being valid the instant a new one is issued.
- **Reuse detection.** If an already-rotated refresh token is presented again — which only happens if a token was captured/replayed, since the legitimate client always has the newest one — the server treats that as a leak signal and revokes **every** live session for that user, not just the one request. A stolen-but-already-used token can't be quietly reused to keep a session alive.
- **Deactivated is the one failure branch that doesn't clear the session cookie.** No cookie, an expired token, and reuse are all genuinely dead ends for that specific token, so the cookie is cleared along with the failure. A deactivated account is different: deactivation is administratively reversible and the refresh token itself was never compromised, so `rotateSession` (`server/src/auth/session.ts`) leaves the cookie in place. If an admin reactivates the account, the same still-valid refresh token can pick the session back up on a later `refresh` call — no new login required. The client leans on this: it retries `refresh` in the background on a timer instead of redirecting to `/login` for `token_expired`/`deactivated`, reserving the login screen for an actual logout (see [`websocket-protocol.md`](../websocket-protocol.md)'s `session_expired` frame and `client/src/lib/apollo.ts`'s `beginReauthRecovery`).
- The client calls this proactively, about a minute ahead of the access token's expiry (see [`accessTokenExpiresAt`](../queries/access-token-expires-at.md)), then does a make-before-break WebSocket reconnect — so this rotation is invisible during normal use.
