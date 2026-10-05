# ws-chat

A real-time, multi-room chat platform with role-based access, persisted history, @mentions, message editing/deletion, rate limiting, and a full admin interface — built with a raw WebSocket layer for real-time messaging and GraphQL for everything else.

[![CI](https://github.com/rodzainna/ws-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/rodzainna/ws-chat/actions/workflows/ci.yml)

## Live demo

**https://chat.rodzainna.com**

| Username | Password      | Role       |
| -------- | ------------- | ---------- |
| `dave`   | `testpass123` | Admin      |
| `alice`  | `testpass123` | User       |
| `carol`  | `testpass123` | Restricted |

`dave` and `alice` are good starting points — both own rooms with existing messages. `carol` demonstrates the restricted role (can't create rooms or self-join public ones, but can participate in rooms she's already a member of). The admin screen is under the "Admin" link in the header, visible only to `dave`.

**Cold start:** the app is on Render's free tier, which spins down after 15 minutes idle — the first request can take up to a minute. `GET /health` is a fast way to warm it up first.

## Documentation

- **[docs/api.md](docs/api.md)** — GraphQL API overview: error conventions, auth model, pagination, core types
  - **[docs/queries/](docs/queries/)** — one file per query: arguments, response shape, auth, example
  - **[docs/mutations/](docs/mutations/)** — one file per mutation: arguments, every `userError` with its exact message and trigger condition, example
- **[docs/websocket-protocol.md](docs/websocket-protocol.md)** — the WebSocket frame protocol in both directions, connection/auth handling, heartbeat, and reconnection behavior
- This file — orientation, architecture, setup, and the design "whys"

## Features

- **Real-time multi-room chat** over a hand-implemented WebSocket layer (not Socket.IO or a framework) — live send/edit/delete, broadcast to every connected member
- **Three-tier role model** (Admin / User / Restricted) with per-room roles (Owner / Member) on top
- **Public and private rooms**, with private rooms shown with a lock icon and their existence hidden from non-members
- **Room membership management** — add or remove members from the members panel, with a live "not already in this room" suggestion list for adding people, Slack-style
- **@mentions**, parsed server-side against the room's real membership and highlighted client-side, with an autocomplete picker as you type
- **Message history** with cursor-based pagination, editing, and soft-deleted messages (shown as "[message deleted]" rather than vanishing without explanation)
- **Message rate limiting** (token bucket, per user) with inline feedback when a send is rejected
- **Live presence** — an online/offline dot per member, derived from actual open connections, not a stored flag
- **Unread and @mention badges** on the room list, driven by WebSocket events even for rooms you aren't currently viewing
- **Seamless session refresh** — access tokens expire in 15 minutes, but a proactive refresh plus a make-before-break WebSocket reconnect means that's invisible while the tab stays open
- **Full admin interface** — role changes, deactivate/reactivate users, soft-delete rooms, remove any message, all paginated
- **Mobile-responsive UI**, including a Slack-mobile-style collapsible room sidebar
- **CI pipeline** (GitHub Actions) running lint, typecheck, build, and the full test suite against a real Postgres service container on every push and pull request

## Core requirements

| Requirement                                                      | Status | Where                                                                                               |
| ---------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| WebSocket connections for real-time client-server communication  | ✅     | `server/src/ws/` — see [Why raw `ws`](#why-raw-ws-over-socketio) below                              |
| Create and join multiple chat rooms/channels                     | ✅     | `createRoom`, `joinRoom`, `rooms` — see [docs/api.md](docs/api.md)                                  |
| Basic user authentication and authorization for chat room access | ✅     | JWT in an httpOnly cookie; `canAccessRoom()` shared by WebSocket and GraphQL so the two can't drift |
| Chat history storage approach, with the "whys"                   | ✅     | See [Chat history: storage and the "whys"](#chat-history-storage-and-the-whys)                      |
| **Bonus:** @mentions, message editing, deletion                  | ✅     | Parsed on send into a `mentions` table; edit/delete are author-only and soft-deleted                |
| **Bonus:** rate limiting for message sending                     | ✅     | Token bucket, per-user, env-configurable                                                            |
| **Bonus:** administrative interface for rooms and users          | ✅     | `/admin` — role changes, deactivate/reactivate, room soft-delete, message removal                   |

## Chat history: storage and the "whys"

Messages live in Postgres (`messages`: `id`, `room_id`, `user_id`, `content`, `created_at`, `edited_at`, `deleted_at`), fetched through a paginated GraphQL query and delivered live over the WebSocket as they're sent.

**Why Postgres over a document store.** This data is inherently relational — users belong to rooms through a membership table, messages belong to both a room and a user, mentions reference both a message and a user. Foreign keys, joins, and ordered pagination are native to a relational database; a document store would mean re-implementing referential integrity and join logic in application code instead of getting it from the database itself.

**Why soft-delete instead of hard-delete.** Both messages and rooms use a nullable `deleted_at` rather than an actual `DELETE`. A deleted message still needs to render as "[message deleted]" to everyone who already saw it live — hard-deleting the row would leave an unexplained gap in the conversation. The same logic applies to a deleted room: it shouldn't silently destroy the message history that happened inside it.

**Why the message transport is split between WebSocket and GraphQL.** Sending, editing, and deleting your own messages happen over WebSocket frames — they're author-owned, real-time by nature, and it's also where the message rate limiter lives. Fetching history, creating rooms, and admin actions happen over GraphQL — naturally request/response, and history pagination specifically benefits from a typed schema. An admin removing _someone else's_ message is a separate GraphQL mutation from a user's own WebSocket-based delete: it's moderation, not the author exercising ownership, and it needs to reach messages the moderator's own socket never sent. Full detail in [docs/api.md](docs/api.md) and [docs/websocket-protocol.md](docs/websocket-protocol.md).

**How previous messages are fetched.** `messages(roomId, last, before)` returns Relay-style cursor pagination — backward-only (newest page first, then scrolling up for older pages via `before`), since the chat view never needs a forward walk from the oldest message. Capped server-side so a single request can't pull unbounded history. Cursor over offset specifically because messages are actively being inserted while someone might be paging back through history — an offset-based page can skip or repeat rows when new ones land between two requests; a cursor anchored to a specific row's position can't.

## Architecture

```
client/          React + Vite + React Router, Apollo Client, shadcn/ui
server/
  src/auth/      JWT issuance/verification, password hashing, login + sign-up rate limiting
  src/graphql/   Apollo Server schema + resolvers (auth, rooms, admin, history)
  src/ws/        raw `ws` server — connection registry, room registry, message handlers
  src/db/        Prisma-backed data access
  src/rooms/     room validation + room-creation rate limiting
  src/messages/  message validation, @mention parsing, message rate limiting
  prisma/        schema + migrations
docs/            API and WebSocket protocol reference
```

One Express server serves the built React app, the GraphQL endpoint, and the WebSocket upgrade from a single origin — required by the auth model below, not just convenience.

| Layer                  | Choice                                                                   | Why                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Realtime               | Raw `ws`                                                                 | <a id="why-raw-ws-over-socketio"></a>WebSockets are _implemented_ directly, not abstracted behind Socket.IO or GraphQL subscriptions — a deliberate choice to show protocol-level understanding (handshake, upgrade, broadcast, heartbeat) rather than leaning on a framework for it |
| API (auth/rooms/admin) | GraphQL via Apollo Server                                                | A typed schema for the request/response side: history pagination, room management, and admin                                                                                                                                                                                         |
| Database               | PostgreSQL + Prisma                                                      | Relational data shape (see above); Prisma for type-safe queries and fast schema iteration                                                                                                                                                                                            |
| Auth                   | JWT in an httpOnly cookie, DB-backed rotating refresh token              | Not readable by JS (closes the XSS token-theft vector); a short-lived access token plus a revocable refresh token means a leaked access token has a small blast radius                                                                                                               |
| Rate limiting          | In-memory token bucket, per user (per IP for sign-ups), env-configurable | No extra infrastructure needed for a single-instance deployment                                                                                                                                                                                                                      |
| Deployment             | Render (app) + Supabase (Postgres), both free tier                       | Single-origin deployment is required by the cookie's `SameSite=Lax` assumption                                                                                                                                                                                                       |

Authorization is centralized, not duplicated: `canAccessRoom(userId, roomId)` is the one function both the WebSocket `join` handler and the GraphQL history resolver use, so private-room access can't drift between the two paths. Every GraphQL resolver and WebSocket handler re-checks `isActive` live — a deactivated user is force-disconnected from any open socket immediately, not just blocked on their next login.

## Running locally

Requires Node 24+ and Docker (for local Postgres).

```bash
git clone <this repo>
cd ws-chat
npm install                              # installs both workspaces

docker compose up -d                     # starts Postgres on :5432

cp server/.env.example server/.env
# edit server/.env — JWT_SECRET needs to be a real random value:
#   openssl rand -base64 48

(cd server && npx prisma migrate dev)

npm run dev:server                       # http://localhost:8080
npm run dev:client                       # http://localhost:5173 — open this one
```

The client's dev server proxies `/graphql` and `/ws` to the backend, so it behaves like the single-origin production setup even locally. Register a new account, or seed some demo data first:

```bash
npm run seed --workspace=server
```

## Testing

```bash
npm run test --workspace=server              # unit tests — resolvers, auth, rate limiters, validation
npm run test:integration --workspace=server   # integration tests — real server + real Postgres
npm run typecheck
npm run lint
```

CI runs all of the above (plus a production build) on every push and pull request against a real Postgres service container — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Known limitations

- No sound or browser notification when a new message arrives in a room you aren't viewing — unread/mention badges are visual only
- No file/image uploads, and no inline preview of image links either — messages are plain text with @mention highlighting only
- No true end-to-end message encryption — server-side content access is required for @mention parsing. TLS in transit and disk encryption at rest are whatever the hosting platform (Render/Supabase) provides by default, not something this app configures itself
- Single-instance only: rate limiting and WebSocket room state are in-memory; a multi-instance deployment would need Redis pub/sub for both
- No read receipts, typing indicators, password reset, or email verification
- No auto-reassignment of room ownership if a room's owner is deactivated
- Unexpected WebSocket disconnects require a page reload to reconnect; automatic retry, room re-subscription, and missed-message reconciliation are not implemented. Normal token refresh remains seamless through a make-before-break socket swap.
- Free-tier hosting isn't always-on: Render spins down after 15 minutes idle, Supabase pauses after 7 days idle — both cold-start on the next request
