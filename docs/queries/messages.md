# `messages`

Fetches a room's message history — backward pagination only (newest-first), Relay-style cursor-paginated.

## Definition

```graphql
type Query {
  messages(roomId: ID!, last: Int, before: String): MessageConnection!
}
```

## Arguments

| Argument | Type     | Required | Default | Notes                                                                                  |
| -------- | -------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `roomId` | `ID!`    | Yes      | —       |                                                                                        |
| `last`   | `Int`    | No       | `50`    | Page size. Capped at `50` regardless of what's asked for.                              |
| `before` | `String` | No       | —       | Opaque cursor from a previous page's `pageInfo.startCursor`. Omit for the latest page. |

Return type — `MessageConnection`:

```graphql
type MessageConnection {
  edges: [MessageEdge!]!
  pageInfo: PageInfo!
}

type MessageEdge {
  cursor: String!
  node: Message!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
  hasPreviousPage: Boolean!
  startCursor: String
}

type Message {
  id: ID!
  roomId: ID!
  userId: ID!
  username: String!
  content: String!
  createdAt: DateTime!
  editedAt: DateTime # null if never edited
  deletedAt: DateTime # null unless soft-deleted
  mentionedUsernames: [String!]!
}
```

`messages` never populates `hasNextPage`/`endCursor` (always `false`/`null`) — there's no forward-pagination direction here, only backward. See [api.md](../api.md#types-worth-knowing) for why `PageInfo` still carries all four fields regardless.

## Auth

Caller must be able to access the room (same `canAccessRoom` check the WebSocket `join` handler uses — see [WebSocket protocol](../websocket-protocol.md)).

**Throws:**

| Code             | Message                               | When                         |
| ---------------- | ------------------------------------- | ---------------------------- |
| `FORBIDDEN`      | `"You are not a member of this room"` | Caller can't access the room |
| `BAD_USER_INPUT` | `"last must be a positive integer"`   | `last` is `0` or negative    |

## Example

Initial load — the latest page:

```graphql
query Messages($roomId: ID!) {
  messages(roomId: $roomId) {
    edges {
      cursor
      node {
        id
        username
        content
        createdAt
        editedAt
        deletedAt
        mentionedUsernames
      }
    }
    pageInfo {
      hasPreviousPage
      startCursor
    }
  }
}
```

Response — always ascending (oldest of the page first, newest last), regardless of which direction the query actually walked to build it:

```json
{
  "data": {
    "messages": {
      "edges": [
        {
          "cursor": "MDFK...",
          "node": {
            "id": "01J...M1",
            "username": "alice",
            "content": "morning @dave",
            "createdAt": "2026-09-21T01:04:12.000Z",
            "editedAt": null,
            "deletedAt": null,
            "mentionedUsernames": ["dave"]
          }
        }
      ],
      "pageInfo": { "hasPreviousPage": true, "startCursor": "MDFK..." }
    }
  }
}
```

Scrolling up for the next older page — `before` is the previous response's `pageInfo.startCursor`, i.e. the oldest message currently on screen:

```graphql
query { messages(roomId: "01J...A", before: "MDFK...") { ... } }
```

A soft-deleted message still comes back through this query — the client renders it as `"[message deleted]"` rather than the original `content` (which the server still returns; the UI does the masking).

## Notes

- **Cursor over offset, deliberately.** Messages are actively being inserted while someone might be paging back through history. An offset-based page (`OFFSET 20 LIMIT 20`) can skip or repeat rows when new rows land between two requests — a cursor anchored to a specific row's position can't.
- **Backward-only, not a general bidirectional Relay connection.** The chat view only ever wants "the latest page" or "the page just before what's already loaded" — never a forward walk from the oldest message — so `first`/`after` were replaced with `last`/`before` rather than adding a second direction nothing uses. `findMessagesPage` (`server/src/db/messages.ts`) walks backward from the cursor in descending `(createdAt, id)` order, then reverses the page to ascending before returning it — every response is oldest-to-newest regardless of which direction the underlying query took to build it.
- **No time bound tied to the WebSocket `join`.** The WS `join` handshake and this query's initial (no-`before`) call race independently on the client; there's no server-side "only messages before you joined" filter. Instead, the client merges the two by message id: any message that arrives live over the socket _before_ this query resolves is kept, and the query's own result fills in everything before it. That merge is what prevents a message sent in the connect/fetch window from being silently dropped.
- Sending, editing, and deleting messages are **not** GraphQL mutations — they're WebSocket frames. See [`websocket-protocol.md`](../websocket-protocol.md) for why the transport is split this way.
