# GraphQL API reference

Endpoint: `POST /graphql`. Auth is a JWT in an httpOnly cookie, set by `login`/`register` and read automatically on every request — nothing to attach manually. Introspection and the Playground are disabled outside `NODE_ENV=development`.

## Conventions

Every mutation returns `userErrors: [UserError!]!` — `{ field: [String!], message: String! }` — for expected, well-formed failures (bad password, duplicate name, already a member, and so on). A `null` payload field alongside a populated `userErrors` array means the request was valid GraphQL but rejected for a business reason.

A **thrown** `GraphQLError` means the caller shouldn't have been able to make this request at all: not logged in (`UNAUTHENTICATED`), wrong role or not permitted (`FORBIDDEN`), or malformed input (`BAD_USER_INPUT`). These are documented per-operation below as "Throws," separately from `userErrors`.

Sending, editing, and deleting messages happen over the [WebSocket connection](./websocket-protocol.md) instead of GraphQL — see that doc for why.

---

## Queries

### `me`

```graphql
me: User
```

The caller's own record. `null` if unauthenticated — this is a query, not a mutation, so there's nothing to throw against; the client is expected to check for `null` and route to `/login`.

### `accessTokenExpiresAt`

```graphql
accessTokenExpiresAt: DateTime
```

The current access token's expiry. Since the token itself lives in an httpOnly cookie, this is the _only_ way the client can know when to proactively refresh — it can't read the cookie directly. `null` when unauthenticated.

### `rooms`

```graphql
rooms: [Room!]!
```

Every public room, plus private rooms the caller already belongs to. A private room's existence isn't disclosed beyond that — the same enumeration-avoidance reasoning as login's generic error, applied to rooms instead of usernames. Each `Room` includes `isMember`, so the client can decide "Open" vs. "Join" per row without a second round trip.

**Auth:** must be logged in (`UNAUTHENTICATED` if not).

### `roomMembers`

```graphql
roomMembers(roomId: ID!): [RoomMember!]!
```

| Argument | Type  | Notes |
| -------- | ----- | ----- |
| `roomId` | `ID!` |       |

**Auth:** caller must already be a member of the room.
**Throws:** `FORBIDDEN` — `"You are not a member of this room"`.

`isOnline` on each `RoomMember` is derived live from open WebSocket connections, never persisted — "online" means at least one open socket anywhere for that user, not "currently viewing this room." Returns `RoomMemberUser` (no `email`) rather than the full `User` type, since any member of a room — not just admins — can read this.

### `roomMembershipCandidates`

```graphql
roomMembershipCandidates(roomId: ID!): [RoomMemberUser!]!
```

| Argument | Type  | Notes |
| -------- | ----- | ----- |
| `roomId` | `ID!` |       |

Active users not already a member of the given room, alphabetical — powers the "Add people" suggestion list in the members dialog.

**Auth:** caller must be this room's owner or a global admin — the same gate `addRoomMember` itself enforces, since this query exists purely to feed that mutation.
**Throws:** `NOT_FOUND` if the room doesn't exist; `FORBIDDEN` — `"Only the room owner or an admin can view addable users"` otherwise.

### `messages`

```graphql
messages(roomId: ID!, first: Int, after: String): MessageConnection!
```

| Argument | Type     | Notes                                                      |
| -------- | -------- | ---------------------------------------------------------- |
| `roomId` | `ID!`    |                                                            |
| `first`  | `Int`    | Page size. Defaults to 20, silently capped at 50.          |
| `after`  | `String` | Opaque cursor from a previous page's `pageInfo.endCursor`. |

Relay-style cursor pagination (`edges { cursor, node }`, `pageInfo { hasNextPage, endCursor }`) — chosen over offset pagination because messages are actively being inserted while someone might be paging back through history; an offset page can skip or repeat rows when new ones land between two requests, a cursor anchored to a row's position can't.

Only returns messages at or before the moment the caller's WebSocket `join` for this room was acknowledged. Anything after that point arrives live over the socket instead of through this query — this ordering (join first, fetch bounded by the join timestamp) is what prevents a message sent in the gap between "fetch history" and "join" from being silently dropped by either path.

**Auth:** caller must be able to access the room (same `canAccessRoom` check the WebSocket `join` handler uses).
**Throws:** `FORBIDDEN` — `"You are not a member of this room"`.

### `users`

```graphql
users(first: Int, after: String): UserConnection!
```

| Argument | Type     | Notes                                                      |
| -------- | -------- | ---------------------------------------------------------- |
| `first`  | `Int`    | Page size. Defaults to 10, capped at 50. Must be positive. |
| `after`  | `String` | Cursor.                                                    |

Full `User` rows (including `email`, `isActive`) — this is the one place email is exposed, since it's admin-only.

**Auth:** admin only.
**Throws:** `FORBIDDEN` — `"Only an admin can list users"`; `BAD_USER_INPUT` if `first` isn't a positive integer.

### `adminRooms`

```graphql
adminRooms(first: Int, after: String): RoomConnection!
```

| Argument | Type     | Notes                                    |
| -------- | -------- | ---------------------------------------- |
| `first`  | `Int`    | Page size. Defaults to 10, capped at 50. |
| `after`  | `String` | Cursor.                                  |

Every non-deleted room, regardless of the caller's membership — unlike `rooms`, which hides private rooms the admin isn't in. `deleteRoom` can already reach any room by id, so this closes the same gap for the admin screen: an admin needs to be able to see (and page through) a room to manage it, not just ones they happen to belong to.

**Auth:** admin only.
**Throws:** `FORBIDDEN`.

---

## Mutations — Auth

### `register`

```graphql
register(input: RegisterInput!): RegisterPayload!
# input: { username: String!, email: String!, password: String! }
```

Auto-logs-in on success — sets the session cookie and returns `accessTokenExpiresAt`, same as `login` would.

**userErrors** (one or more, by field):

| Field                 | Message                                                                                                  | Condition                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `username`            | `"Username must be 3-20 characters: lowercase letters, numbers, and underscores only"`                   | Character set is restricted so `@username` mention parsing stays unambiguous — no spaces or punctuation to worry about in the regex.                                                      |
| `email`               | `"Email is not valid"`                                                                                   |                                                                                                                                                                                           |
| `password`            | `"Password must be at least 8 characters"` / `"Password must be at most <N> bytes"`                      | The upper bound exists so an oversized password fails cleanly instead of throwing inside the hashing call.                                                                                |
| `username` or `email` | `"Username is already taken"` / `"Email is already registered"` / `"That information is already in use"` | Race-safe: caught from the DB's own unique-constraint violation, not a separate pre-check, so two concurrent registrations for the same username can't both "pass" a check and then fail. |

### `login`

```graphql
login(input: LoginInput!): LoginPayload!
# input: { username: String!, password: String! }
```

**userErrors:**

| Field | Message                                              | Condition                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[]`  | `"Invalid username or password"`                     | Unknown username, wrong password, **or** a deactivated account — deliberately identical in all three cases, and timing-equalized with a dummy bcrypt comparison, so none is distinguishable from outside. |
| `[]`  | `"Too many login attempts. Please try again later."` | Rate-limited by both the attempted username and the caller's IP — username-only would let anyone lock out an account they don't own; IP-only would let one attacker spray guesses across many usernames.  |

### `logout`

```graphql
logout: LogoutPayload!
# → { success: Boolean! }
```

Revokes the refresh token, clears the session cookie, and force-disconnects every live WebSocket for that user (`session_expired`, reason `logged_out`) — not just this request's own session. No `userErrors`; always succeeds from the caller's perspective even if there was nothing to revoke.

**Auth:** none required — safe to call from an already-logged-out client.

### `refresh`

```graphql
refresh: RefreshPayload!
```

Rotates the refresh token cookie: validates it, atomically claims it for rotation, and issues a fresh access+refresh pair.

**userErrors:**

| Field | Message                                              | Condition                                                                                                                                                                         |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[]`  | `"Session expired or invalid. Please log in again."` | One generic message for every failure branch (no cookie, expired, already-rotated, deactivated account) — the client does the same thing (redirect to login) regardless of which. |

Reusing an already-rotated refresh token revokes **every** live session for that user, not just this request — reuse is itself a signal the token leaked.

---

## Mutations — Rooms

### `createRoom`

```graphql
createRoom(input: CreateRoomInput!): CreateRoomPayload!
# input: { name: String!, isPrivate: Boolean! }
```

**Auth:** logged in, and not `RESTRICTED` (thrown, not a userError — not something a well-formed request should trip by accident).
**Throws:** `UNAUTHENTICATED`; `FORBIDDEN` — `"Restricted users cannot create rooms"`.

**userErrors** (checked in this order):

| Field  | Message                                                      | Condition                                                                                                                             |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `[]`   | `"Maximum number of rooms (<N>) reached."`                   | Global cap (`MAX_ROOMS`, default 50). Checked before the rate-limit reserve, since hitting a global cap isn't the caller's own fault. |
| `[]`   | `"Too many rooms created recently. Please try again later."` | Per-user token bucket.                                                                                                                |
| `name` | `"Room name must be 3-50 characters"`                        |                                                                                                                                       |
| `name` | `"Room name is already taken"`                               | Race-safe via the DB's unique constraint, same reasoning as `register`.                                                               |

### `joinRoom`

```graphql
joinRoom(roomId: ID!): JoinRoomPayload!
```

Public rooms only — a private room needs `addRoomMember` from an owner or admin instead.

**Auth:** logged in, not `RESTRICTED` (restricted users never self-join, public or private).
**Throws:** `FORBIDDEN` — `"Restricted users cannot join rooms directly"`.

**userErrors:**

| Field    | Message                                                     | Condition                                                                                                           |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `roomId` | `"Room not found"`                                          | Also returned for a private room whose existence shouldn't be confirmed or denied by a different error — see below. |
| `roomId` | `"This room is private — ask an owner or admin to add you"` |                                                                                                                     |
| `roomId` | `"You are already a member of this room"`                   | Race-safe via the `(roomId, userId)` primary key.                                                                   |

### `addRoomMember`

```graphql
addRoomMember(roomId: ID!, username: String!): AddRoomMemberPayload!
```

| Argument   | Type                                      |
| ---------- | ----------------------------------------- |
| `roomId`   | `ID!`                                     |
| `username` | `String!` — exact match, case-insensitive |

Adds the target as a `MEMBER` (never `OWNER`).

**Auth:** caller must be this room's owner or a global admin.
**Throws:** `FORBIDDEN` — `"Only the room owner or an admin can add members"`.

**userErrors:**

| Field      | Message                                        | Condition                                           |
| ---------- | ---------------------------------------------- | --------------------------------------------------- |
| `roomId`   | `"Room not found"`                             |                                                     |
| `username` | `"User not found"`                             | Also returned if the target account is deactivated. |
| `username` | `"That user is already a member of this room"` | Race-safe via the unique constraint.                |

### `removeRoomMember`

```graphql
removeRoomMember(roomId: ID!, userId: ID!): RemoveRoomMemberPayload!
```

| Argument | Type                                                           |
| -------- | -------------------------------------------------------------- |
| `roomId` | `ID!`                                                          |
| `userId` | `ID!` — note: `userId`, not `username`, unlike `addRoomMember` |

**Auth:** same gate as `addRoomMember` — room owner or a global admin.
**Throws:** `FORBIDDEN` — `"Only the room owner or an admin can remove members"`.

**userErrors:**

| Field    | Message                                    | Condition                                                                                                |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `roomId` | `"Room not found"`                         |                                                                                                          |
| `userId` | `"That user is not a member of this room"` | Also returned on a concurrent-removal race (the target was already removed by another request).          |
| `userId` | `"Cannot remove the room owner"`           | No ownership-reassignment path exists, so removing the owner would leave the room permanently ownerless. |

On success, also evicts the removed member's live WebSocket session(s) from the room — see [`removed_from_room`](./websocket-protocol.md#removed_from_room) for why the DB row alone isn't enough.

### `deleteRoom`

```graphql
deleteRoom(roomId: ID!): DeleteRoomPayload!
```

Soft-delete (`deletedAt` set, row kept) — preserves message history under a deleted room rather than orphaning or destroying it.

**Auth:** room owner or a global admin.
**Throws:** `FORBIDDEN` — `"Only the room owner or an admin can delete this room"`.

**userErrors:**

| Field    | Message            | Condition                                  |
| -------- | ------------------ | ------------------------------------------ |
| `roomId` | `"Room not found"` | Also returned on a concurrent-delete race. |

Broadcasts `room_deleted` to every connected member **before** evicting them from the room's live registry — otherwise a slow or non-compliant client could keep acting in a room that's already gone from the DB.

---

## Mutations — Messages

### `deleteMessage`

```graphql
deleteMessage(messageId: ID!): DeleteMessagePayload!
```

Admin-only, works on **any** message — this is moderation, not the author exercising ownership (that's the WebSocket `delete` frame instead). No owner exception the way `deleteRoom` has one.

**Auth:** admin only.
**Throws:** `FORBIDDEN` — `"Only an admin can delete another user's message"`.

**userErrors:**

| Field       | Message               | Condition                                                                                                                                                                         |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messageId` | `"Message not found"` | Covers both "never existed" and "already deleted" — one atomic DB guard distinguishes them from "here's the row," and both non-success outcomes map to the same userError anyway. |

Broadcasts the same `message_deleted` WebSocket event a self-delete would, so every room member's view updates identically regardless of who deleted it.

---

## Mutations — Admin (user management)

All four throw `FORBIDDEN` for a non-admin caller, and all respect `SUPERADMIN_USERNAME` if it's set — that one account can never be moved away from admin/active by any of these, including by itself.

### `setGlobalRole`

```graphql
setGlobalRole(userId: ID!, role: GlobalRole!): SetGlobalRolePayload!
# role: ADMIN | USER | RESTRICTED
```

One mutation with an explicit target role, not separate `promoteUser`/`demoteUser` calls — three tiers don't map cleanly onto a binary promote/demote pair, and one mutation is simpler to guard and audit.

**Auth:** admin only.
**Throws:** `FORBIDDEN` — `"Only an admin can change a user's role"`.

**userErrors:**

| Field    | Message                                        | Condition                                                                                                                                                |
| -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userId` | `"User not found"`                             |                                                                                                                                                          |
| `role`   | `"This account's role cannot be changed"`      | Target is the superadmin account.                                                                                                                        |
| `role`   | `"Cannot change the last active admin's role"` | The platform's active-admin count can never hit zero — enforced atomically even against two concurrent requests demoting two _different_ admins at once. |

### `deactivateUser`

```graphql
deactivateUser(userId: ID!): DeactivateUserPayload!
```

**Auth:** admin only.
**Throws:** `FORBIDDEN` — `"Only an admin can deactivate a user"`.

**userErrors:**

| Field    | Message                                     | Condition                                 |
| -------- | ------------------------------------------- | ----------------------------------------- |
| `userId` | `"User not found"`                          |                                           |
| `userId` | `"User is already deactivated"`             |                                           |
| `userId` | `"This account cannot be deactivated"`      | Target is the superadmin account.         |
| `userId` | `"Cannot deactivate the last active admin"` | Same zero-admin guard as `setGlobalRole`. |

On success, force-disconnects every live WebSocket for that user immediately (`session_expired`, reason `deactivated`) — deactivation is also re-checked live on every GraphQL request and WS `join`, so this covers the one case those two checks can't: a socket that connected before deactivation and never makes another request.

### `reactivateUser`

```graphql
reactivateUser(userId: ID!): ReactivateUserPayload!
```

**Auth:** admin only.
**Throws:** `FORBIDDEN` — `"Only an admin can reactivate a user"`.

**userErrors:**

| Field    | Message                    | Condition |
| -------- | -------------------------- | --------- |
| `userId` | `"User not found"`         |           |
| `userId` | `"User is already active"` |           |

No force-disconnect needed on success, unlike deactivation — the user simply regains access on their next request or socket connection.

---

## Types worth knowing

- **`User`** vs. **`RoomMemberUser`** — deliberately different shapes. `RoomMemberUser` (used by `roomMembers`/`roomMembershipCandidates`) omits `email`: those queries are readable by any room member or room owner, not just admins, and a peer shouldn't be able to harvest email addresses off every room they're in.
- **`UserError`** — `{ field: [String!], message: String! }`. `field` is a list (not a single string) so a single error can point at more than one field when relevant, and is empty for an error that isn't field-specific (a global rate limit, for instance).
- **Cursor pagination**, not offset — used by every paginated query (`messages`, `users`, `adminRooms`). See `messages` above for the concurrency reason.
