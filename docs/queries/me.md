# `me`

Returns the caller's own account record.

## Definition

```graphql
type Query {
  me: User
}
```

Return type — [`User`](../api.md#user):

| Field        | Type          | Notes                             |
| ------------ | ------------- | --------------------------------- |
| `id`         | `ID!`         |                                   |
| `username`   | `String!`     |                                   |
| `email`      | `String!`     |                                   |
| `globalRole` | `GlobalRole!` | `ADMIN` \| `USER` \| `RESTRICTED` |
| `isActive`   | `Boolean!`    |                                   |
| `createdAt`  | `DateTime!`   |                                   |

## Auth

None required at the GraphQL layer — this query is the mechanism for finding out _whether_ you're authenticated, not something that gates on it.

Returns `null` if the caller has no valid session. There is nothing to throw against here: a logged-out client calling `me` is a normal, expected case, not an error. The client is expected to check for `null` and route to `/login` itself.

## Example

```graphql
query Me {
  me {
    id
    username
    globalRole
    isActive
  }
}
```

Logged in:

```json
{
  "data": {
    "me": {
      "id": "01J...",
      "username": "dave",
      "globalRole": "ADMIN",
      "isActive": true
    }
  }
}
```

Logged out:

```json
{
  "data": {
    "me": null
  }
}
```

## Notes

- The session itself is a JWT in an httpOnly cookie — `me` is the read side of "am I logged in," since the client can't inspect the cookie directly.
- Paired with [`accessTokenExpiresAt`](./access-token-expires-at.md) on app boot: `me` establishes identity, `accessTokenExpiresAt` establishes how long that identity is good for before a [`refresh`](../mutations/refresh.md) is needed.
