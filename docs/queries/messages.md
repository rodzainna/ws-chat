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

**Throws:** `FORBIDDEN` — `"You are not a member of this room"`.

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
- **Only returns messages at or before the moment the caller's WebSocket `join` for this room was acknowledged.** Anything sent after that point arrives live over the socket instead of through this query. This "join first, fetch bounded by the join timestamp" ordering is what prevents a message sent in the gap between "fetch history" and "join" from being silently dropped by either path — it lands in exactly one of the two, never both, never neither.
- Sending, editing, and deleting messages are **not** GraphQL mutations — they're WebSocket frames. See [`websocket-protocol.md`](../websocket-protocol.md) for why the transport is split this way.
