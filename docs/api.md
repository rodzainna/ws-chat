# GraphQL API overview

Endpoint: `POST /graphql`. Auth is a JWT in an httpOnly cookie, set by [`login`](./mutations/login.md)/[`register`](./mutations/register.md) and read automatically on every request — nothing to attach manually. Introspection and the Playground are disabled outside `NODE_ENV=development`.

Every query and mutation has its own reference file, one operation per file:

- **[docs/queries/](./queries/README.md)** — `me`, `accessTokenExpiresAt`, `rooms`, `roomMembers`, `roomMembershipCandidates`, `messages`, `users`, `adminRooms`
- **[docs/mutations/](./mutations/README.md)** — auth (`register`/`login`/`logout`/`refresh`), rooms (`createRoom`/`joinRoom`/`addRoomMember`/`removeRoomMember`/`deleteRoom`), messages (`deleteMessage`), admin (`setGlobalRole`/`deactivateUser`/`reactivateUser`)

Sending, editing, and deleting your **own** messages happen over the [WebSocket connection](./websocket-protocol.md) instead of GraphQL — see that doc for why the transport is split this way.

This page covers what's shared across every operation: error conventions, auth model, pagination, and the core object types.

## Error conventions

Every mutation returns `userErrors: [UserError!]!` — `{ field: [String!], message: String! }` — for **expected, well-formed failures** (bad password, duplicate name, already a member, and so on). A `null` payload field alongside a populated `userErrors` array means the request was valid GraphQL and reached the resolver, but was rejected for a business reason. The HTTP status is still `200 OK`.

A **thrown** `GraphQLError` means the caller shouldn't have been able to make this request at all: not logged in (`UNAUTHENTICATED`), wrong role or not permitted (`FORBIDDEN`), or malformed input (`BAD_USER_INPUT`). These surface in the response's top-level `errors` array, the normal GraphQL way, and are documented per-operation as "Throws."

The rule of thumb: if a well-behaved client could hit this by doing something a real user does (wrong password, duplicate room name, message you don't own), it's a `userError`. If only a client that's ignoring the schema or the UI's own gating could hit it, it throws.

## Auth model

- **Access token** — a short-lived (15 minute) JWT, in an httpOnly, `Secure`, `SameSite=Lax` cookie. Not readable by client-side JavaScript, which closes the XSS token-theft vector; [`accessTokenExpiresAt`](./queries/access-token-expires-at.md) exists specifically because the client can't read the cookie itself to find out when it expires.
- **Refresh token** — a longer-lived (3 day), DB-backed, single-use, rotating token. [`refresh`](./mutations/refresh.md) exchanges it for a fresh pair; reusing an already-rotated one revokes every live session for that user, treating reuse itself as a leak signal.
- **WebSocket auth** reads the same cookie at connect time (`Cookie` header on the upgrade request) — an unauthenticated upgrade is rejected outright (401), never admitted as an anonymous connection, since sockets are keyed by `userId` everywhere downstream (rate limiting, presence, force-disconnect).
- **Roles** are two independent layers: a **global role** (`ADMIN` / `USER` / `RESTRICTED`) on `User`, and a **per-room role** (`OWNER` / `MEMBER`) on `RoomMember`. A room owner isn't necessarily a global admin, and a global admin doesn't need a `RoomMember` row to act on a room.

## Pagination

Every paginated query ([`messages`](./queries/messages.md), [`users`](./queries/users.md), [`adminRooms`](./queries/admin-rooms.md)) uses Relay-style cursor pagination — `edges { cursor, node }` + `pageInfo { hasNextPage, endCursor }` — instead of offset-based paging. The reason is concurrency: rows can be inserted while someone is actively paging (new messages arrive live; new users register), and an offset page (`OFFSET n LIMIT m`) can skip or repeat rows when that happens. A cursor anchored to a specific row's position can't.

`first` is always optional with a sane default, and always **server-capped** regardless of what the client asks for — see each query's own page for its exact numbers.

## Types worth knowing

<a id="user"></a>**`User`**

| Field        | Type          |
| ------------ | ------------- |
| `id`         | `ID!`         |
| `username`   | `String!`     |
| `email`      | `String!`     |
| `globalRole` | `GlobalRole!` |
| `isActive`   | `Boolean!`    |
| `createdAt`  | `DateTime!`   |

Full shape, including `email` — only ever returned by the admin-only [`users`](./queries/users.md) query and auth mutations returning the caller's own record. Everywhere a user needs to be shown to a peer (room member lists), `RoomMemberUser` is used instead.

<a id="room"></a>**`Room`**

| Field       | Type        |
| ----------- | ----------- |
| `id`        | `ID!`       |
| `name`      | `String!`   |
| `isPrivate` | `Boolean!`  |
| `createdBy` | `ID!`       |
| `createdAt` | `DateTime!` |
| `isMember`  | `Boolean!`  |

**`RoomMemberUser`** vs. **`User`** — deliberately different shapes. `RoomMemberUser` (used by [`roomMembers`](./queries/room-members.md)/[`roomMembershipCandidates`](./queries/room-membership-candidates.md)) omits `email`: those queries are readable by any member of a room, not just admins, and a peer shouldn't be able to harvest email addresses off every room they're in.

**`UserError`** — `{ field: [String!], message: String! }`. `field` is a list, not a single string, so one error can point at more than one field when relevant, and is empty (`[]`) for an error that isn't field-specific (a global rate limit, for instance).

## Live demo & reference implementation

The [README](../README.md) has login credentials for the deployed instance and the architecture summary. [`docs/websocket-protocol.md`](./websocket-protocol.md) covers the real-time half of the API that lives outside GraphQL.
