# `deactivateUser`

Deactivates a user account and force-disconnects any live sessions immediately.

## Definition

```graphql
type Mutation {
  deactivateUser(userId: ID!): DeactivateUserPayload!
}

type DeactivateUserPayload {
  user: User
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type  | Required | Notes |
| -------- | ----- | -------- | ----- |
| `userId` | `ID!` | Yes      |       |

## Auth

Admin only. Also respects `SUPERADMIN_USERNAME` if configured — see [`setGlobalRole`](./set-global-role.md#notes).

**Throws:** `FORBIDDEN` — `"Only an admin can deactivate a user"`.

## userErrors

| Field    | Message                                     | Condition                                                         |
| -------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `userId` | `"User not found"`                          |                                                                   |
| `userId` | `"User is already deactivated"`             |                                                                   |
| `userId` | `"This account cannot be deactivated"`      | Target is the designated superadmin account.                      |
| `userId` | `"Cannot deactivate the last active admin"` | Same zero-admin guard as [`setGlobalRole`](./set-global-role.md). |

## Example

```graphql
mutation DeactivateUser($userId: ID!) {
  deactivateUser(userId: $userId) {
    user {
      id
      isActive
    }
    userErrors {
      field
      message
    }
  }
}
```

```json
{
  "data": {
    "deactivateUser": {
      "user": { "id": "01J...C", "isActive": false },
      "userErrors": []
    }
  }
}
```

## Notes

- **On success, force-disconnects every live WebSocket for that user right away** — the client receives a `session_expired` frame with reason `"deactivated"` and the socket closes server-side. This is the one gap the platform's other live checks can't cover: every GraphQL request and WebSocket `join` already re-checks `isActive` on the fly, but a socket that connected _before_ deactivation and never makes another request would otherwise stay live indefinitely without this explicit push.
- A deactivated account's next [`login`](./login.md) attempt fails with the same generic `"Invalid username or password"` message as a wrong password or unknown username — deactivation doesn't get its own distinct error, for the same no-enumeration reasoning `login` applies everywhere else.
- To restore access, see [`reactivateUser`](./reactivate-user.md).
