# `setGlobalRole`

Changes a user's platform-wide role.

## Definition

```graphql
type Mutation {
  setGlobalRole(userId: ID!, role: GlobalRole!): SetGlobalRolePayload!
}

enum GlobalRole {
  ADMIN
  USER
  RESTRICTED
}

type SetGlobalRolePayload {
  user: User
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type          | Required | Notes                             |
| -------- | ------------- | -------- | --------------------------------- |
| `userId` | `ID!`         | Yes      |                                   |
| `role`   | `GlobalRole!` | Yes      | `ADMIN` \| `USER` \| `RESTRICTED` |

## Auth

Admin only. Also respects `SUPERADMIN_USERNAME` if configured — see Notes.

**Throws:** `FORBIDDEN` — `"Only an admin can change a user's role"`.

## userErrors

| Field    | Message                                        | Condition                                                                                                                                                                    |
| -------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userId` | `"User not found"`                             |                                                                                                                                                                              |
| `role`   | `"This account's role cannot be changed"`      | Target is the designated superadmin account.                                                                                                                                 |
| `role`   | `"Cannot change the last active admin's role"` | The platform's active-admin count can never hit zero — enforced atomically, including against two concurrent requests each demoting a _different_ admin at once (see Notes). |

## Example

```graphql
mutation SetGlobalRole($userId: ID!, $role: GlobalRole!) {
  setGlobalRole(userId: $userId, role: $role) {
    user {
      id
      username
      globalRole
    }
    userErrors {
      field
      message
    }
  }
}
```

Variables:

```json
{ "userId": "01J...C", "role": "USER" }
```

Success:

```json
{
  "data": {
    "setGlobalRole": {
      "user": { "id": "01J...C", "username": "carol", "globalRole": "USER" },
      "userErrors": []
    }
  }
}
```

Blocked — would drop the last active admin:

```json
{
  "data": {
    "setGlobalRole": {
      "user": null,
      "userErrors": [
        {
          "field": ["role"],
          "message": "Cannot change the last active admin's role"
        }
      ]
    }
  }
}
```

## Notes

- **One mutation with an explicit target role, not `promoteUser`/`demoteUser`.** Three tiers (`ADMIN` / `USER` / `RESTRICTED`) don't map cleanly onto a binary promote/demote pair — a single mutation with an explicit target is simpler to reason about, guard, and audit than three tiers of directional transitions.
- **The zero-admin guard is a real concurrency guard, not just a pre-check.** It's enforced with row locking strong enough to catch two _simultaneous_ requests demoting two _different_ admins — a scenario a naive "count admins, then update" check would miss, since both requests could read "2 admins" before either commits its own demotion.
- **`SUPERADMIN_USERNAME`** (optional env var) names one account that no admin — including that account itself — can move away from `ADMIN`/active via this mutation or [`deactivateUser`](./deactivate-user.md). It's a safety rail, not a fourth role tier: promotion _to_ admin still works normally for every account, since there's no separate first-admin bootstrap mechanism.
