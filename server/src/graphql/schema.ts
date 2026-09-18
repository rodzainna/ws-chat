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

  type Room {
    id: ID!
    name: String!
    isPrivate: Boolean!
    createdBy: ID!
    createdAt: DateTime!
    isMember: Boolean!
  }

  type Message {
    id: ID!
    roomId: ID!
    userId: ID!
    username: String!
    content: String!
    createdAt: DateTime!
    editedAt: DateTime
    deletedAt: DateTime
    mentionedUsernames: [String!]!
  }

  type MessageEdge {
    cursor: String!
    node: Message!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type MessageConnection {
    edges: [MessageEdge!]!
    pageInfo: PageInfo!
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

  input CreateRoomInput {
    name: String!
    isPrivate: Boolean!
  }

  type CreateRoomPayload {
    room: Room
    userErrors: [UserError!]!
  }

  type JoinRoomPayload {
    room: Room
    userErrors: [UserError!]!
  }

  type AddRoomMemberPayload {
    room: Room
    userErrors: [UserError!]!
  }

  type SetGlobalRolePayload {
    user: User
    userErrors: [UserError!]!
  }

  type Query {
    me: User
    rooms: [Room!]!
    messages(roomId: ID!, first: Int, after: String): MessageConnection!
  }

  type Mutation {
    register(input: RegisterInput!): RegisterPayload!
    login(input: LoginInput!): LoginPayload!
    logout: LogoutPayload!
    refresh: RefreshPayload!
    createRoom(input: CreateRoomInput!): CreateRoomPayload!
    joinRoom(roomId: ID!): JoinRoomPayload!
    addRoomMember(roomId: ID!, username: String!): AddRoomMemberPayload!
    setGlobalRole(userId: ID!, role: GlobalRole!): SetGlobalRolePayload!
  }
`;
