# `logout`

Ends the current browser's session, in every tab. Other browsers and devices stay logged in.

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

- Revokes every refresh token in the session, clears the cookies, and closes that session's WebSockets with a `session_expired` frame (reason `"logged_out"`).
- The session comes from the refresh token cookie, since the access token has often expired by logout.
- No `userErrors` — there's no well-formed failure mode for "log me out" that's worth surfacing to the client differently from success.
