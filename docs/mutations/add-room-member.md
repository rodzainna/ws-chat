# `addRoomMember`

Adds a user to a room as `MEMBER` — the owner/admin-driven counterpart to self-service [`joinRoom`](./join-room.md).

## Definition

```graphql
type Mutation {
  addRoomMember(roomId: ID!, username: String!): AddRoomMemberPayload!
}

type AddRoomMemberPayload {
  room: Room
  userErrors: [UserError!]!
}
```

## Arguments

| Argument   | Type      | Required | Notes                         |
| ---------- | --------- | -------- | ----------------------------- |
| `roomId`   | `ID!`     | Yes      |                               |
| `username` | `String!` | Yes      | Exact match, case-insensitive |

Note the target is identified by `username` here, but by `userId` in the sibling mutation [`removeRoomMember`](./remove-room-member.md) — see Notes.

## Auth

A global-role gate, not a room-scoped one: any logged-in user whose `globalRole` is `ADMIN` or `USER` can add someone to **any** room, including one they don't own or belong to themselves. Adding is deliberately the permissive direction — removing (below) is the one that stays admin-only.

**Throws:** `FORBIDDEN` — `"Restricted users cannot add room members"`.

## userErrors

| Field      | Message                                        | Condition                                               |
| ---------- | ---------------------------------------------- | ------------------------------------------------------- |
| `roomId`   | `"Room not found"`                             |                                                         |
| `username` | `"User not found"`                             | Also returned if the target account is deactivated.     |
| `username` | `"That user is already a member of this room"` | Race-safe via the unique constraint on room membership. |

## Example

```graphql
mutation AddRoomMember($roomId: ID!, $username: String!) {
  addRoomMember(roomId: $roomId, username: $username) {
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

Variables:

```json
{ "roomId": "01J...R", "username": "carol" }
```

Success:

```json
{
  "data": { "addRoomMember": { "room": { "id": "01J...R" }, "userErrors": [] } }
}
```

## Live effects

On success, two WebSocket events go out (see [WebSocket protocol](../websocket-protocol.md)):

- **`room_members_changed`** — broadcast to everyone currently viewing this room, so an already-open member list picks up the new member without a manual refresh.
- **`added_to_room`** — sent directly to the added user's own socket(s), wherever they are in the app (room list, a different room, nothing open at all). This is what tells their room sidebar a new room just became visible to them.

## Notes

- Always adds as `MEMBER`, never `OWNER` — there's no path to hand off or share ownership through this mutation. A room has exactly one owner, set at creation time.
- This is the **only** way a `RESTRICTED` user, or anyone, gets into a private room — private rooms have no self-join path at all (see [`joinRoom`](./join-room.md)).
- Use [`roomMembershipCandidates`](../queries/room-membership-candidates.md) to drive the "who can I add" suggestion list — it shares this mutation's exact auth gate, so anyone who can see the list can act on it.
- On the `userId` vs. `username` inconsistency with `removeRoomMember`: adding targets a person you're identifying by name (typed or picked from a filtered suggestion list), while removing targets a specific row already rendered in the member list UI, where the id is already on hand and unambiguous. It's a minor asymmetry, not an oversight.
