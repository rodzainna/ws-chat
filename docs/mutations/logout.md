# `logout`

Ends the caller's session everywhere, not just for this request.

## Definition

```graphql
type Mutation {
  logout: LogoutPayload!
}

type LogoutPayload {
  success: Boolean!
}
```

No arguments.

## Auth

None required — safe to call from an already-logged-out client. Always returns `{ success: true }`, even if there was nothing to revoke.

## Example

```graphql
mutation Logout {
  logout {
    success
  }
}
```

```json
{ "data": { "logout": { "success": true } } }
```

## Notes

- Revokes the refresh token, clears the session cookie, **and force-disconnects every live WebSocket for that user** — not just the session tied to this particular request. Log out from one tab and every other open tab's socket gets a `session_expired` frame with reason `"logged_out"` and closes immediately.
- The user id used for the force-disconnect comes from the **refresh token record being revoked**, not from `context.userId` off the access token — at logout time the access token has often already expired, so the refresh token is the only reliable source of "whose sockets do we disconnect."
- No `userErrors` — there's no well-formed failure mode for "log me out" that's worth surfacing to the client differently from success.
