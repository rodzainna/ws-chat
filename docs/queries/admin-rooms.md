# `adminRooms`

Admin-only paginated listing of every non-deleted room, regardless of the caller's membership.

## Definition

```graphql
type Query {
  adminRooms(first: Int, after: String): RoomConnection!
}
```

## Arguments

| Argument | Type     | Required | Default | Notes                      |
| -------- | -------- | -------- | ------- | -------------------------- |
| `first`  | `Int`    | No       | `10`    | Page size, capped at `50`. |
| `after`  | `String` | No       | —       | Opaque cursor.             |

Return type — `RoomConnection`:

```graphql
type RoomConnection {
  edges: [RoomEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type RoomEdge {
  cursor: String!
  node: Room!
}
```

See [`rooms`](./rooms.md#definition) for the `Room` shape.

## Auth

Admin only.

**Throws:**

| Code             | Message                              | When                        |
| ---------------- | ------------------------------------ | --------------------------- |
| `FORBIDDEN`      | `"Only an admin can list all rooms"` | Caller isn't a global admin |
| `BAD_USER_INPUT` | `"first must be a positive integer"` | `first` is `0` or negative  |

## Example

```graphql
query AdminRooms($first: Int, $after: String) {
  adminRooms(first: $first, after: $after) {
    totalCount
    edges {
      node {
        id
        name
        isPrivate
        createdBy
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

```json
{
  "data": {
    "adminRooms": {
      "totalCount": 20,
      "edges": [
        {
          "node": {
            "id": "01J...A",
            "name": "general",
            "isPrivate": false,
            "createdBy": "01J...U"
          }
        }
      ],
      "pageInfo": { "hasNextPage": true, "endCursor": "MDFK..." }
    }
  }
}
```

## Notes

- **Why this exists alongside `rooms`.** The regular [`rooms`](./rooms.md) query hides private rooms the caller isn't a member of, by design — that's the correct behavior for the chat UI. But [`deleteRoom`](../mutations/delete-room.md) can already reach _any_ room by id, private or not, if you're an admin. Without `adminRooms`, the admin screen would have a mutation that can act on rooms it has no way to list. This query closes that gap: an admin needs to be able to _see_ (and page through) a room in order to manage it, not just ones they happen to belong to.
- Soft-deleted rooms (`deletedAt` set) are excluded — see [`deleteRoom`](../mutations/delete-room.md) for why deletion is soft in the first place.
