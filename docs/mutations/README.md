# Mutations

Every GraphQL mutation, one file per operation. See [`../api.md`](../api.md) for conventions shared across the whole API (the `userErrors` vs. thrown-error split, auth model, pagination) and [`../websocket-protocol.md`](../websocket-protocol.md) for sending/editing/deleting messages, which are WebSocket frames rather than mutations here.

## Auth

| Mutation                    | Auth                | Purpose                        |
| --------------------------- | ------------------- | ------------------------------ |
| [`register`](./register.md) | None                | Create an account, auto-login  |
| [`login`](./login.md)       | None                | Start a session                |
| [`logout`](./logout.md)     | None                | End the session everywhere     |
| [`refresh`](./refresh.md)   | Valid refresh token | Rotate access + refresh tokens |

## Rooms

| Mutation                                      | Auth                         | Purpose                                   |
| --------------------------------------------- | ---------------------------- | ----------------------------------------- |
| [`createRoom`](./create-room.md)              | Logged in, not `RESTRICTED`  | Create a room, caller becomes owner       |
| [`joinRoom`](./join-room.md)                  | Logged in, not `RESTRICTED`  | Self-join a public room                   |
| [`addRoomMember`](./add-room-member.md)       | Any `ADMIN`/`USER`, any room | Add someone to a room (public or private) |
| [`removeRoomMember`](./remove-room-member.md) | Admin only                   | Remove a member, evict their live sockets |
| [`deleteRoom`](./delete-room.md)              | Room owner or admin          | Soft-delete a room                        |

## Messages

| Mutation                               | Auth  | Purpose                                                                                                                       |
| -------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`deleteMessage`](./delete-message.md) | Admin | Moderation delete of **any** message (own-message delete is a WebSocket frame — see [protocol doc](../websocket-protocol.md)) |

## Admin (user management)

All four of these respect `SUPERADMIN_USERNAME` if configured — see [`setGlobalRole`](./set-global-role.md#notes).

| Mutation                                 | Auth  | Purpose                                          |
| ---------------------------------------- | ----- | ------------------------------------------------ |
| [`setGlobalRole`](./set-global-role.md)  | Admin | Change a user's `ADMIN`/`USER`/`RESTRICTED` role |
| [`deactivateUser`](./deactivate-user.md) | Admin | Deactivate + force-disconnect live sockets       |
| [`reactivateUser`](./reactivate-user.md) | Admin | Restore access                                   |
