# `roomMembershipCandidates`

Lists active users who are not already a member of a given room — the addable-user suggestion list.

## Definition

```graphql
type Query {
  roomMembershipCandidates(roomId: ID!): [RoomMemberUser!]!
}
```

## Arguments

| Argument | Type  | Required | Notes |
| -------- | ----- | -------- | ----- |
| `roomId` | `ID!` | Yes      |       |

Return type — `[RoomMemberUser!]!`, alphabetical by `username`. See [`roomMembers`](./room-members.md#definition) for the `RoomMemberUser` shape.

## Auth

Caller must be this room's owner or a global admin — the same gate [`addRoomMember`](../mutations/add-room-member.md) itself enforces.

**Throws:**

| Code        | Message                                                    | When                                     |
| ----------- | ---------------------------------------------------------- | ---------------------------------------- |
| `NOT_FOUND` | —                                                          | Room doesn't exist                       |
| `FORBIDDEN` | `"Only the room owner or an admin can view addable users"` | Caller isn't the owner or a global admin |

## Example

```graphql
query RoomMembershipCandidates($roomId: ID!) {
  roomMembershipCandidates(roomId: $roomId) {
    id
    username
  }
}
```

```json
{
  "data": {
    "roomMembershipCandidates": [
      { "id": "01J...C", "username": "carol" },
      { "id": "01J...E", "username": "eve" }
    ]
  }
}
```

## Notes

- This query exists purely to feed [`addRoomMember`](../mutations/add-room-member.md)'s "Add people" dialog — it deliberately shares that mutation's exact auth gate, since showing the list to someone who couldn't act on it would be a dead end at best and an information leak at worst.
- Deactivated users are excluded, not just already-members — inviting someone who can't log in isn't a useful suggestion.
