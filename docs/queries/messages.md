# `messages`

Fetches a room's message history, Relay-style cursor-paginated.

## Definition

```graphql
type Query {
  messages(roomId: ID!, first: Int, after: String): MessageConnection!
}
```

## Arguments

| Argument | Type     | Required | Default | Notes                                                              |
| -------- | -------- | -------- | ------- | ------------------------------------------------------------------ |
| `roomId` | `ID!`    | Yes      | —       |                                                                    |
| `first`  | `Int`    | No       | `20`    | Page size. Silently capped at `50` regardless of what's asked for. |
| `after`  | `String` | No       | —       | Opaque cursor from a previous page's `pageInfo.endCursor`.         |

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

## Auth

Caller must be able to access the room (same `canAccessRoom` check the WebSocket `join` handler uses — see [WebSocket protocol](../websocket-protocol.md)).

**Throws:**

| Code             | Message                               | When                         |
| ---------------- | ------------------------------------- | ---------------------------- |
| `FORBIDDEN`      | `"You are not a member of this room"` | Caller can't access the room |
| `BAD_USER_INPUT` | `"first must be a positive integer"`  | `first` is `0` or negative   |

## Example

```graphql
query Messages($roomId: ID!, $first: Int, $after: String) {
  messages(roomId: $roomId, first: $first, after: $after) {
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
      hasNextPage
      endCursor
    }
  }
}
```

Variables:

```json
{ "roomId": "01J...A", "first": 20 }
```

Response:

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
      "pageInfo": { "hasNextPage": true, "endCursor": "MDFK..." }
    }
  }
}
```

Paging forward:

```graphql
query { messages(roomId: "01J...A", first: 20, after: "MDFK...") { ... } }
```

A soft-deleted message still comes back through this query — the client renders it as `"[message deleted]"` rather than the original `content` (which the server still returns; the UI does the masking).

## Notes

- **Cursor over offset, deliberately.** Messages are actively being inserted while someone might be paging back through history. An offset-based page (`OFFSET 20 LIMIT 20`) can skip or repeat rows when new rows land between two requests — a cursor anchored to a specific row's position can't.
- **No time bound of its own — always returns the room's full current history up to `first`.** The WS `join` handshake and this query are fired together and race independently on the client; there's no server-side "only messages before you joined" filter. Instead, the client merges the two by message id: any message that arrives live over the socket _before_ this query resolves is kept, and the query's own result fills in everything before it. That merge is what prevents a message sent in the connect/fetch window from being silently dropped — without it, a `setMessages(history)` that just replaced state on query-resolve would erase anything the socket had already delivered.
- Sending, editing, and deleting messages are **not** GraphQL mutations — they're WebSocket frames. See [`websocket-protocol.md`](../websocket-protocol.md) for why the transport is split this way.
