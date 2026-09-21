# `deleteRoom`

Soft-deletes a room.

## Definition

```graphql
type Mutation {
  deleteRoom(roomId: ID!): DeleteRoomPayload!
}

type DeleteRoomPayload {
  room: Room
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type  | Required | Notes |
| -------- | ----- | -------- | ----- |
| `roomId` | `ID!` | Yes      |       |

## Auth

The room's owner, or a global admin.

**Throws:** `FORBIDDEN` — `"Only the room owner or an admin can delete this room"`.

## userErrors

| Field    | Message            | Condition                                  |
| -------- | ------------------ | ------------------------------------------ |
| `roomId` | `"Room not found"` | Also returned on a concurrent-delete race. |

## Example

```graphql
mutation DeleteRoom($roomId: ID!) {
  deleteRoom(roomId: $roomId) {
    room {
      id
    }
    userErrors {
      field
      message
    }
  }
}
```

```json
{ "data": { "deleteRoom": { "room": { "id": "01J...R" }, "userErrors": [] } } }
```

## Notes

- **Soft-delete, not hard-delete.** `deletedAt` is set; the row and every message inside it stay in the database. Hard-deleting would either cascade-destroy message history or leave it orphaned pointing at a room that no longer exists — soft-delete preserves it cleanly under a room that's now marked deleted.
- **Ordering matters on the live-broadcast side.** The server broadcasts `room_deleted` to every connected member **before** evicting them from the room's in-memory registry. Evicting first would mean a slow or non-compliant client could keep sending, editing, or deleting messages in a room that's already gone from the database — the WebSocket handlers trust the in-memory registry, not a live `deletedAt` check, on every frame.
- A deleted room disappears from [`rooms`](../queries/rooms.md) and [`adminRooms`](../queries/admin-rooms.md) alike; there's no "trash" view or undelete.
