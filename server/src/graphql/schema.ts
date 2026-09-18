import { DateTimeTypeDefinition } from "graphql-scalars";

export const typeDefs = `#graphql
  ${DateTimeTypeDefinition}

  type User {
    id: ID!
    username: String!
    email: String!
    globalRole: GlobalRole!
    isActive: Boolean!
    createdAt: DateTime!
  }

  enum GlobalRole {
    ADMIN
    USER
    RESTRICTED
  }

  type UserError {
    field: [String!]
    message: String!
  }

  input RegisterInput {
    username: String!
    email: String!
    password: String!
  }

  input LoginInput {
    username: String!
    password: String!
  }

  type RegisterPayload {
    user: User
    userErrors: [UserError!]!
  }

  type LoginPayload {
    user: User
    userErrors: [UserError!]!
  }

  type LogoutPayload {
    success: Boolean!
  }

  type RefreshPayload {
    user: User
    userErrors: [UserError!]!
  }

  type Query {
    me: User
  }

  type Mutation {
    register(input: RegisterInput!): RegisterPayload!
    login(input: LoginInput!): LoginPayload!
    logout: LogoutPayload!
    refresh: RefreshPayload!
  }
`;
