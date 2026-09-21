# `joinRoom`

Self-joins a **public** room.

## Definition

```graphql
type Mutation {
  joinRoom(roomId: ID!): JoinRoomPayload!
}

type JoinRoomPayload {
  room: Room
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type  | Required | Notes |
| -------- | ----- | -------- | ----- |
| `roomId` | `ID!` | Yes      |       |

## Auth

Logged in, and not `RESTRICTED`.

**Throws:** `FORBIDDEN` — `"Restricted users cannot join rooms directly"`. Restricted accounts never self-join, public or private — the only way in is [`addRoomMember`](./add-room-member.md) from another non-`RESTRICTED` user.

## userErrors

| Field    | Message                                                     | Condition                                                                      |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `roomId` | `"Room not found"`                                          | Room doesn't exist, or has been soft-deleted.                                  |
| `roomId` | `"This room is private — ask a member or admin to add you"` | Room exists and is private.                                                    |
| `roomId` | `"You are already a member of this room"`                   | Race-safe via the `(roomId, userId)` composite primary key on room membership. |

## Example

```graphql
mutation JoinRoom($roomId: ID!) {
  joinRoom(roomId: $roomId) {
    room {
      id
      name
    }
    userErrors {
      field
      message
    }
  }
}
```

Success:

```json
{
  "data": {
    "joinRoom": {
      "room": { "id": "01J...R", "name": "watercooler" },
      "userErrors": []
    }
  }
}
```

Room is private (caller isn't a member):

```json
{
  "data": {
    "joinRoom": {
      "room": null,
      "userErrors": [
        {
          "field": ["roomId"],
          "message": "This room is private — ask a member or admin to add you"
        }
      ]
    }
  }
}
```

## Notes

- Checks run in order: room exists → room is public → not already a member. A private room's `roomId` still needs to have reached the client from somewhere (private rooms the caller doesn't belong to are never surfaced by [`rooms`](../queries/rooms.md) in the first place), so this mutation confirming "this room is private" isn't the leak — the listing query is what actually withholds existence.
- Adding someone to a **private** room is a different mutation entirely: [`addRoomMember`](./add-room-member.md), gated to any non-`RESTRICTED` user, not room ownership.
