# `register`

Creates a new account and logs it in.

## Definition

```graphql
type Mutation {
  register(input: RegisterInput!): RegisterPayload!
}

input RegisterInput {
  username: String!
  email: String!
  password: String!
}

type RegisterPayload {
  user: User
  accessTokenExpiresAt: DateTime
  userErrors: [UserError!]!
}
```

## Arguments

| Argument | Type             | Required | Notes |
| -------- | ---------------- | -------- | ----- |
| `input`  | `RegisterInput!` | Yes      |       |

## Auth

None required — this is how an account first comes into existence.

On success, also sets the session cookie and returns `accessTokenExpiresAt` — identical to what [`login`](./login.md) returns, so the client can treat "just registered" and "just logged in" the same way afterward.

## userErrors

One or more of the following, by field:

| Field                     | Message                                                                                                  | Condition                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `username`                | `"Username must be 3-20 characters: lowercase letters, numbers, and underscores only"`                   | Character set is restricted so `@username` mention parsing stays unambiguous — no spaces or punctuation to worry about in the regex.                                                             |
| `email`                   | `"Email is not valid"`                                                                                   |                                                                                                                                                                                                  |
| `password`                | `"Password must be at least 8 characters"` / `"Password must be at most <N> bytes"`                      | The upper bound exists so an oversized password fails cleanly with a `userError` instead of throwing inside the bcrypt call.                                                                     |
| `username` **or** `email` | `"Username is already taken"` / `"Email is already registered"` / `"That information is already in use"` | Race-safe: caught from the database's own unique-constraint violation, not a separate pre-check — so two concurrent registrations for the same username can't both "pass" a check and then fail. |

## Example

```graphql
mutation Register($input: RegisterInput!) {
  register(input: $input) {
    user {
      id
      username
    }
    accessTokenExpiresAt
    userErrors {
      field
      message
    }
  }
}
```

Variables:

```json
{
  "input": {
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "correct horse battery staple"
  }
}
```

Success:

```json
{
  "data": {
    "register": {
      "user": { "id": "01J...N", "username": "newuser" },
      "accessTokenExpiresAt": "2026-09-21T14:47:00.000Z",
      "userErrors": []
    }
  }
}
```

Validation failure — `user` is `null`, request still returns `200 OK` with populated `userErrors`:

```json
{
  "data": {
    "register": {
      "user": null,
      "accessTokenExpiresAt": null,
      "userErrors": [
        { "field": ["username"], "message": "Username is already taken" }
      ]
    }
  }
}
```

## Notes

- Password is hashed with bcrypt before it ever reaches the database — the plaintext is never persisted or logged.
- A new account defaults to the `USER` global role — there's no self-registration path to `ADMIN` or `RESTRICTED`. Promotion happens via [`setGlobalRole`](./set-global-role.md), admin-only.
