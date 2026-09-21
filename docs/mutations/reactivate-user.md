# `reactivateUser`

Restores a deactivated user's access.

## Definition

```graphql
type Mutation {
  reactivateUser(userId: ID!): ReactivateUserPayload!
}

type ReactivateUserPayload {
  user: User
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type  | Required | Notes |
| -------- | ----- | -------- | ----- |
| `userId` | `ID!` | Yes      |       |

## Auth

Admin only.

**Throws:** `FORBIDDEN` — `"Only an admin can reactivate a user"`.

## userErrors

| Field    | Message                    | Condition |
| -------- | -------------------------- | --------- |
| `userId` | `"User not found"`         |           |
| `userId` | `"User is already active"` |           |

## Example

```graphql
mutation ReactivateUser($userId: ID!) {
  reactivateUser(userId: $userId) {
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
    "reactivateUser": {
      "user": { "id": "01J...C", "isActive": true },
      "userErrors": []
    }
  }
}
```

## Notes

- **No force-disconnect needed**, unlike [`deactivateUser`](./deactivate-user.md) — there's nothing live to tear down on the way _back in_. The user simply regains access on their next GraphQL request or WebSocket connection attempt, both of which check `isActive` live anyway.
- The symmetric counterpart to `deactivateUser` — same auth gate, no `SUPERADMIN_USERNAME` special-casing needed here since reactivating is never the harmful direction.
