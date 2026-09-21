# Queries

Every GraphQL query, one file per operation. See [`../api.md`](../api.md) for conventions shared across the whole API (auth model, error conventions, cursor pagination) and [`../websocket-protocol.md`](../websocket-protocol.md) for everything that happens over the WebSocket instead of here.

| Query                                                         | Auth                | Purpose                                                |
| ------------------------------------------------------------- | ------------------- | ------------------------------------------------------ |
| [`me`](./me.md)                                               | None                | The caller's own account, or `null` if unauthenticated |
| [`accessTokenExpiresAt`](./access-token-expires-at.md)        | None                | When to proactively call `refresh`                     |
| [`rooms`](./rooms.md)                                         | Logged in           | Public rooms + the caller's private rooms              |
| [`roomMembers`](./room-members.md)                            | Room member         | Room roster with live online status                    |
| [`roomMembershipCandidates`](./room-membership-candidates.md) | Room owner or admin | Addable-user suggestions for `addRoomMember`           |
| [`messages`](./messages.md)                                   | Room access         | Cursor-paginated message history                       |
| [`users`](./users.md)                                         | Admin               | Every user account, including `email`                  |
| [`adminRooms`](./admin-rooms.md)                              | Admin               | Every room, including private ones the admin isn't in  |
