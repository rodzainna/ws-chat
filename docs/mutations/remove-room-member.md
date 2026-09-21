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

Admin only — no room-owner exception. Deliberately **not** the same gate as [`addRoomMember`](./add-room-member.md): removing is moderation, not the owner exercising authority over their own room (same reasoning as [`deleteMessage`](./delete-message.md)'s admin-only gate having no owner carve-out either). A room's owner who isn't a global admin can no longer remove members from their own room.

**Throws:** `FORBIDDEN` — `"Only an admin can remove room members"`.

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

## Live effects

On success, two WebSocket events go out (see [WebSocket protocol](../websocket-protocol.md)):

- **`room_members_changed`** — broadcast to everyone still viewing this room, so their member list refetches without a manual reload.
- **`removed_from_room`** — sent to **every** open socket the removed user has, not just ones currently joined to this room. Their room sidebar isn't scoped to any one room, so it needs to hear about this even if they're sitting on the room list or looking at something else entirely when it happens.

## Notes

- **On success, also evicts the removed member's live WebSocket session(s) from the room's in-memory registry** — a plain database delete would leave an already-connected socket still receiving and able to send messages in a room it no longer has a membership row for. See [`removed_from_room`](../websocket-protocol.md#removed_from_room) in the WebSocket protocol doc for the frame this triggers. Eviction itself stays scoped to sockets actually joined to the room — the notice above goes wider than eviction does.
- If the target has multiple open sockets (several tabs/devices), every one of them is notified, and every one of them still joined to this room is evicted.
