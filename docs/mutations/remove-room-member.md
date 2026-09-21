# `removeRoomMember`

Removes a member from a room, and evicts their live WebSocket sessions from it.

## Definition

```graphql
type Mutation {
  removeRoomMember(roomId: ID!, userId: ID!): RemoveRoomMemberPayload!
}

type RemoveRoomMemberPayload {
  room: Room
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type  | Required | Notes                                                                           |
| -------- | ----- | -------- | ------------------------------------------------------------------------------- |
| `roomId` | `ID!` | Yes      |                                                                                 |
| `userId` | `ID!` | Yes      | Note: `userId`, not `username` — unlike [`addRoomMember`](./add-room-member.md) |

## Auth

Same gate as [`addRoomMember`](./add-room-member.md) — the room's owner or a global admin.

**Throws:** `FORBIDDEN` — `"Only the room owner or an admin can remove members"`.

## userErrors

| Field    | Message                                    | Condition                                                                                                                                                           |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roomId` | `"Room not found"`                         |                                                                                                                                                                     |
| `userId` | `"That user is not a member of this room"` | Also returned on a concurrent-removal race — the target was already removed by another request.                                                                     |
| `userId` | `"Cannot remove the room owner"`           | No ownership-reassignment path exists (see [Known limitations](../../README.md#known-limitations)) — removing the owner would leave the room permanently ownerless. |

## Example

```graphql
mutation RemoveRoomMember($roomId: ID!, $userId: ID!) {
  removeRoomMember(roomId: $roomId, userId: $userId) {
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
{
  "data": {
    "removeRoomMember": { "room": { "id": "01J...R" }, "userErrors": [] }
  }
}
```

Attempting to remove the owner:

```json
{
  "data": {
    "removeRoomMember": {
      "room": null,
      "userErrors": [
        { "field": ["userId"], "message": "Cannot remove the room owner" }
      ]
    }
  }
}
```

## Notes

- **On success, also evicts the removed member's live WebSocket session(s) from the room's in-memory registry** — a plain database delete would leave an already-connected socket still receiving and able to send messages in a room it no longer has a membership row for. See [`removed_from_room`](../websocket-protocol.md#removed_from_room) in the WebSocket protocol doc for the frame this triggers.
- If the target has multiple open sockets (several tabs/devices), every one of them is evicted, not just one.
