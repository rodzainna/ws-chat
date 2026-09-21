# `accessTokenExpiresAt`

Returns the expiry timestamp of the caller's current access token.

## Definition

```graphql
type Query {
  accessTokenExpiresAt: DateTime
}
```

Returns a `DateTime` scalar (ISO 8601 string), or `null`.

## Auth

None required — mirrors [`me`](./me.md). `null` when unauthenticated.

## Example

```graphql
query AccessTokenExpiresAt {
  accessTokenExpiresAt
}
```

```json
{
  "data": {
    "accessTokenExpiresAt": "2026-09-21T14:32:07.000Z"
  }
}
```

## Notes

- The access token itself lives in an **httpOnly** cookie specifically so client-side JavaScript can't read it (closes the XSS token-theft vector). That means the client also can't read its `exp` claim directly — this query exists purely to hand that one value back out, since the client needs it to know _when_ to proactively call [`refresh`](../mutations/refresh.md).
- The client's session-refresh logic polls this on an interval and fires `refresh` about a minute ahead of the returned expiry, then makes a "before-break" WebSocket reconnect — so a token expiring mid-session is invisible to the user rather than causing a visible disconnect.
- Access tokens are short-lived (15 minutes) by design; see [`refresh`](../mutations/refresh.md) for the token-rotation model this supports.
