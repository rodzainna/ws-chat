# `createRoom`

Creates a new room, owned by the caller.

## Definition

```graphql
type Mutation {
  createRoom(input: CreateRoomInput!): CreateRoomPayload!
}

input CreateRoomInput {
  name: String!
  isPrivate: Boolean!
}

type CreateRoomPayload {
  room: Room
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type               | Required | Notes |
| -------- | ------------------ | -------- | ----- |
| `input`  | `CreateRoomInput!` | Yes      |       |

## Auth

Logged in, and not `RESTRICTED`.

**Throws:**

| Code              | Message                                  | When                                                                                                                                                                               |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNAUTHENTICATED` | —                                        | No valid session                                                                                                                                                                   |
| `FORBIDDEN`       | `"Restricted users cannot create rooms"` | Caller's `globalRole` is `RESTRICTED` — a well-formed request from a restricted account should never reach this point via the UI, so it throws rather than returning a `userError` |

## userErrors

Checked in this order — an earlier check short-circuits the ones below it:

| Field  | Message                                                      | Condition                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[]`   | `"Maximum number of rooms (<N>) reached."`                   | Global cap, `MAX_ROOMS` env var (default `50`). Checked first — before the rate-limit reserve — since hitting a global cap isn't the caller's fault and shouldn't cost them a rate-limit token. |
| `[]`   | `"Too many rooms created recently. Please try again later."` | Per-user token bucket (`RATE_LIMIT_MAX_ROOM_CREATIONS`, default `5` per `RATE_LIMIT_ROOM_CREATION_WINDOW_SECONDS`, default `300`).                                                              |
| `name` | `"Room name must be 3-50 characters"`                        |                                                                                                                                                                                                 |
| `name` | `"Room name is already taken"`                               | Race-safe via the database's unique constraint, same pattern as [`register`](./register.md)'s username/email check.                                                                             |

## Example

```graphql
mutation CreateRoom($input: CreateRoomInput!) {
  createRoom(input: $input) {
    room {
      id
      name
      isPrivate
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
{ "input": { "name": "engineering", "isPrivate": true } }
```

Success:

```json
{
  "data": {
    "createRoom": {
      "room": { "id": "01J...R", "name": "engineering", "isPrivate": true },
      "userErrors": []
    }
  }
}
```

## Notes

- The creator is automatically added as the room's `OWNER` — there's no separate "join your own room" step.
- `RESTRICTED` accounts can participate in rooms they're already members of, but can neither create rooms nor self-join public ones (see [`joinRoom`](./join-room.md)) — they can only be added by an owner or admin via [`addRoomMember`](./add-room-member.md).
