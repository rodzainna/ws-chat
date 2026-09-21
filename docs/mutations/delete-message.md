# `deleteMessage`

Admin moderation delete — removes **any** message, not just the caller's own.

## Definition

```graphql
type Mutation {
  deleteMessage(messageId: ID!): DeleteMessagePayload!
}

type DeleteMessagePayload {
  message: Message
  userErrors: [UserError!]!
}
```

## Arguments

| Argument    | Type  | Required | Notes |
| ----------- | ----- | -------- | ----- |
| `messageId` | `ID!` | Yes      |       |

## Auth

Admin only. No owner exception: deleting someone else's message is moderation.

**Throws:** `FORBIDDEN` — `"Only an admin can delete another user's message"`.

## userErrors

| Field       | Message               | Condition                                                                                                                                                                               |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messageId` | `"Message not found"` | Covers both "never existed" and "already deleted" — one atomic database guard distinguishes them from "here's the row," and both non-success outcomes map to the same userError anyway. |

## Example

```graphql
mutation DeleteMessage($messageId: ID!) {
  deleteMessage(messageId: $messageId) {
    message {
      id
      deletedAt
    }
    userErrors {
      field
      message
    }
  }
}
```

```json
{
  "data": {
    "deleteMessage": {
      "message": { "id": "01J...M", "deletedAt": "2026-09-21T02:10:00.000Z" },
      "userErrors": []
    }
  }
}
```

## Notes

- **This is a GraphQL mutation, deliberately, not a WebSocket frame** — unlike a user deleting their _own_ message, which happens over the WebSocket `delete` frame (see [WebSocket protocol](../websocket-protocol.md)). An author's own delete is ownership; an admin removing someone else's message is moderation, and it needs to reach messages the moderator's own socket never sent, in rooms the moderator may not even be a member of.
- Soft-delete, same as a self-delete — `deletedAt` is set, the row stays. Broadcasts the identical `message_deleted` WebSocket event a self-delete would, so every room member's client updates the same way regardless of who triggered it.
