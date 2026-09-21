# `roomMembers`

Lists the members of a room, with live online/offline status.

## Definition

```graphql
type Query {
  roomMembers(roomId: ID!): [RoomMember!]!
}
```

## Arguments

| Argument | Type  | Required | Notes |
| -------- | ----- | -------- | ----- |
| `roomId` | `ID!` | Yes      |       |

Return type — `RoomMember`:

| Field      | Type              | Notes                                 |
| ---------- | ----------------- | ------------------------------------- |
| `user`     | `RoomMemberUser!` | See below                             |
| `role`     | `RoomRole!`       | `OWNER` \| `MEMBER`                   |
| `isOnline` | `Boolean!`        | Live, not persisted — see Notes below |

`RoomMemberUser` (deliberately **not** the full `User` type):

| Field        | Type          | Notes |
| ------------ | ------------- | ----- |
| `id`         | `ID!`         |       |
| `username`   | `String!`     |       |
| `globalRole` | `GlobalRole!` |       |
| `isActive`   | `Boolean!`    |       |
| `createdAt`  | `DateTime!`   |       |

Not paginated — room member counts are small enough that cursor pagination would add ceremony without benefit.

## Auth

Caller must already be a member of the room.

**Throws:** `FORBIDDEN` — `"You are not a member of this room"`.

## Example

```graphql
query RoomMembers($roomId: ID!) {
  roomMembers(roomId: $roomId) {
    user {
      id
      username
    }
    role
    isOnline
  }
}
```

```json
{
  "data": {
    "roomMembers": [
      {
        "user": { "id": "01J...A", "username": "dave" },
        "role": "OWNER",
        "isOnline": true
      },
      {
        "user": { "id": "01J...B", "username": "alice" },
        "role": "MEMBER",
        "isOnline": false
      }
    ]
  }
}
```

## Notes

- **`isOnline` is derived live from the WebSocket connection registry, never persisted to the database.** "Online" means _at least one open socket anywhere_ for that user — not "currently viewing this room." A user with two browser tabs open, one on this room and one on another, still shows online here.
- Returns `RoomMemberUser` rather than the full `User` type specifically to omit `email`. Unlike the admin-only [`users`](./users.md) query, this one is readable by any member of the room — a fellow member shouldn't be able to harvest email addresses just by opening the members panel.
- Feeds the chat UI's member list and the online-dot next to sender names on message bubbles.
