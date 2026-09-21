# `login`

Authenticates a user and starts a session.

## Definition

```graphql
type Mutation {
  login(input: LoginInput!): LoginPayload!
}

input LoginInput {
  username: String!
  password: String!
}

type LoginPayload {
  user: User
  accessTokenExpiresAt: DateTime
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type          | Required | Notes |
| -------- | ------------- | -------- | ----- |
| `input`  | `LoginInput!` | Yes      |       |

## Auth

None required.

On success, sets a session cookie: JWT access token (15 min) in an httpOnly, `Secure`, `SameSite=Lax` cookie, plus a DB-backed rotating refresh token (3 days). Nothing to attach manually on subsequent requests — the cookie rides along automatically.

## userErrors

| Field | Message                                              | Condition                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[]`  | `"Invalid username or password"`                     | Unknown username, wrong password, **or** a deactivated account — deliberately identical in all three cases, and timing-equalized with a dummy bcrypt comparison on the "unknown username" path, so none is distinguishable from the outside. |
| `[]`  | `"Too many login attempts. Please try again later."` | Rate-limited by both the attempted username and the caller's IP — username-only would let anyone lock out an account they don't own; IP-only would let one attacker spray guesses across many usernames.                                     |

## Example

```graphql
mutation Login($input: LoginInput!) {
  login(input: $input) {
    user {
      id
      username
      globalRole
    }
    accessTokenExpiresAt
    userErrors {
      field
      message
    }
  }
}
```

Variables:

```json
{ "input": { "username": "dave", "password": "testpass123" } }
```

Success:

```json
{
  "data": {
    "login": {
      "user": { "id": "01J...D", "username": "dave", "globalRole": "ADMIN" },
      "accessTokenExpiresAt": "2026-09-21T14:47:00.000Z",
      "userErrors": []
    }
  }
}
```

Failure (bad password, unknown user, or deactivated account — indistinguishable on purpose):

```json
{
  "data": {
    "login": {
      "user": null,
      "accessTokenExpiresAt": null,
      "userErrors": [{ "field": [], "message": "Invalid username or password" }]
    }
  }
}
```

## Notes

- **No user enumeration.** A wrong password and a nonexistent username return the exact same message. Under the hood, a nonexistent username still runs a bcrypt comparison against a dummy hash before returning — otherwise a "real users take longer to reject than fake ones" timing difference would leak the same information the identical error message is trying to hide.
- The username/IP rate limiter here is intentionally **stricter** than the message-send rate limiter — brute-forcing credentials is a materially worse outcome than a burst of chat messages.
- See [`refresh`](./refresh.md) for how the session is kept alive past the 15-minute access token, and [`logout`](./logout.md) for tearing it down.
