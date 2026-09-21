# `rooms`

Lists rooms visible to the caller: every public room, plus private rooms the caller already belongs to.

## Definition

```graphql
type Query {
  rooms: [Room!]!
}
```

Return type — [`Room`](../api.md#room):

| Field       | Type        | Notes                                                             |
| ----------- | ----------- | ----------------------------------------------------------------- |
| `id`        | `ID!`       |                                                                   |
| `name`      | `String!`   |                                                                   |
| `isPrivate` | `Boolean!`  |                                                                   |
| `createdBy` | `ID!`       | Owner's user id                                                   |
| `createdAt` | `DateTime!` |                                                                   |
| `isMember`  | `Boolean!`  | Whether the caller already belongs to this room — see Notes below |

Not paginated. Room counts are capped (`MAX_ROOMS`, default 50 — see [`createRoom`](../mutations/create-room.md)), so a full list stays small enough that cursor pagination would be pure ceremony.

## Auth

Must be logged in.

**Throws:** `UNAUTHENTICATED` if the caller has no valid session.

## Example

```graphql
query Rooms {
  rooms {
    id
    name
    isPrivate
    isMember
  }
}
```

```json
{
  "data": {
    "rooms": [
      {
        "id": "01J...A",
        "name": "general",
        "isPrivate": false,
        "isMember": true
      },
      {
        "id": "01J...B",
        "name": "engineering",
        "isPrivate": true,
        "isMember": true
      },
      {
        "id": "01J...C",
        "name": "watercooler",
        "isPrivate": false,
        "isMember": false
      }
    ]
  }
}
```

## Notes

- **A private room's existence is never disclosed to non-members.** This query simply omits private rooms the caller isn't in — it doesn't return them with `isMember: false` the way it does for public rooms. This is the same enumeration-avoidance principle [`login`](../mutations/login.md) applies to usernames, applied to room names instead: if private rooms _did_ leak into this list, a caller could learn a room called `"layoffs-planning"` exists without being in it.
- `isMember` lets the client decide "Open" vs. "Join" per row in a single request — without it, the client would need a second round trip (or a client-side guess) per room to know which action to offer.
- For an admin view that needs to see _every_ room, including private ones the admin doesn't belong to, see [`adminRooms`](./admin-rooms.md) instead — this query deliberately doesn't serve that use case.
