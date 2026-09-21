# `users`

Admin-only paginated listing of every user account, including fields not exposed anywhere else.

## Definition

```graphql
type Query {
  users(first: Int, after: String): UserConnection!
}
```

## Arguments

| Argument | Type     | Required | Default | Notes                                                      |
| -------- | -------- | -------- | ------- | ---------------------------------------------------------- |
| `first`  | `Int`    | No       | `10`    | Page size. Must be a positive integer; capped at `50`.     |
| `after`  | `String` | No       | —       | Opaque cursor from a previous page's `pageInfo.endCursor`. |

Return type — `UserConnection`:

```graphql
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  cursor: String!
  node: User!
}

type User {
  id: ID!
  username: String!
  email: String!
  globalRole: GlobalRole!
  isActive: Boolean!
  createdAt: DateTime!
}
```

## Auth

Admin only.

**Throws:**

| Code             | Message                          | When                             |
| ---------------- | -------------------------------- | -------------------------------- |
| `FORBIDDEN`      | `"Only an admin can list users"` | Caller isn't a global admin      |
| `BAD_USER_INPUT` | —                                | `first` isn't a positive integer |

## Example

```graphql
query Users($first: Int, $after: String) {
  users(first: $first, after: $after) {
    totalCount
    edges {
      cursor
      node {
        id
        username
        email
        globalRole
        isActive
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

```json
{
  "data": {
    "users": {
      "totalCount": 27,
      "edges": [
        {
          "cursor": "MDFK...",
          "node": {
            "id": "01J...A",
            "username": "alice",
            "email": "alice@example.com",
            "globalRole": "USER",
            "isActive": true
          }
        }
      ],
      "pageInfo": { "hasNextPage": true, "endCursor": "MDFK..." }
    }
  }
}
```

## Notes

- **This is the one place `email` is exposed** — everywhere else a user or member shape is returned ([`roomMembers`](./room-members.md), [`roomMembershipCandidates`](./room-membership-candidates.md)) uses `RoomMemberUser`, which deliberately omits it. Gating `email` visibility behind admin-only access, rather than field-level auth, keeps the privacy boundary simple to reason about: one query, one gate.
- Powers the admin screen's Users tab (role picker, deactivate/reactivate), paired with [`setGlobalRole`](../mutations/set-global-role.md), [`deactivateUser`](../mutations/deactivate-user.md), and [`reactivateUser`](../mutations/reactivate-user.md).
