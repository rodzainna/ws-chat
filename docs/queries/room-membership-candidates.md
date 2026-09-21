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

A global-role gate, not a room-scoped one — the same gate [`addRoomMember`](../mutations/add-room-member.md) itself enforces (any `ADMIN` or `USER`, not tied to owning or belonging to this specific room). Checked before the room lookup below, so a `RESTRICTED` caller gets `FORBIDDEN` even for a room that doesn't exist.

**Throws:**

| Code        | Message                                      | When                                  |
| ----------- | -------------------------------------------- | ------------------------------------- |
| `FORBIDDEN` | `"Restricted users cannot add room members"` | Caller's `globalRole` is `RESTRICTED` |
| `NOT_FOUND` | —                                            | Room doesn't exist                    |

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
