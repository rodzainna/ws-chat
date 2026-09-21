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

  enum RoomRole {
    OWNER
    MEMBER
  }

  type RoomMemberUser {
    id: ID!
    username: String!
    globalRole: GlobalRole!
    isActive: Boolean!
    createdAt: DateTime!
  }

  type RoomMember {
    user: RoomMemberUser!
    role: RoomRole!
    isOnline: Boolean!
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

  type UserEdge {
    cursor: String!
    node: User!
  }

  type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type RoomEdge {
    cursor: String!
    node: Room!
  }

  type RoomConnection {
    edges: [RoomEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
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
    accessTokenExpiresAt: DateTime
    userErrors: [UserError!]!
  }

  type LoginPayload {
    user: User
    accessTokenExpiresAt: DateTime
    userErrors: [UserError!]!
  }

  type LogoutPayload {
    success: Boolean!
  }

  type RefreshPayload {
    user: User
    accessTokenExpiresAt: DateTime
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

  type DeleteRoomPayload {
    room: Room
    userErrors: [UserError!]!
  }

  type DeleteMessagePayload {
    message: Message
    userErrors: [UserError!]!
  }

  type SetGlobalRolePayload {
    user: User
    userErrors: [UserError!]!
  }

  type DeactivateUserPayload {
    user: User
    userErrors: [UserError!]!
  }

  type ReactivateUserPayload {
    user: User
    userErrors: [UserError!]!
  }

  type Query {
    me: User
    accessTokenExpiresAt: DateTime
    rooms: [Room!]!
    roomMembers(roomId: ID!): [RoomMember!]!
    messages(roomId: ID!, first: Int, after: String): MessageConnection!
    users(first: Int, after: String): UserConnection!
    adminRooms(first: Int, after: String): RoomConnection!
  }

  type Mutation {
    register(input: RegisterInput!): RegisterPayload!
    login(input: LoginInput!): LoginPayload!
    logout: LogoutPayload!
    refresh: RefreshPayload!
    createRoom(input: CreateRoomInput!): CreateRoomPayload!
    joinRoom(roomId: ID!): JoinRoomPayload!
    addRoomMember(roomId: ID!, username: String!): AddRoomMemberPayload!
    deleteRoom(roomId: ID!): DeleteRoomPayload!
    deleteMessage(messageId: ID!): DeleteMessagePayload!
    setGlobalRole(userId: ID!, role: GlobalRole!): SetGlobalRolePayload!
    deactivateUser(userId: ID!): DeactivateUserPayload!
    reactivateUser(userId: ID!): ReactivateUserPayload!
  }
`;
