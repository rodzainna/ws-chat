import { DateTimeResolver } from "graphql-scalars";
import { register } from "./resolvers/mutations/register.js";
import { login } from "./resolvers/mutations/login.js";
import { logout } from "./resolvers/mutations/logout.js";
import { refresh } from "./resolvers/mutations/refresh.js";
import { createRoom } from "./resolvers/mutations/createRoom.js";
import { joinRoom } from "./resolvers/mutations/joinRoom.js";
import { addRoomMember } from "./resolvers/mutations/addRoomMember.js";
import { removeRoomMember } from "./resolvers/mutations/removeRoomMember.js";
import { deleteRoom } from "./resolvers/mutations/deleteRoom.js";
import { deleteMessage } from "./resolvers/mutations/deleteMessage.js";
import { setGlobalRole } from "./resolvers/mutations/setGlobalRole.js";
import { deactivateUser } from "./resolvers/mutations/deactivateUser.js";
import { reactivateUser } from "./resolvers/mutations/reactivateUser.js";
import { messages } from "./resolvers/queries/messages.js";
import { users } from "./resolvers/queries/users.js";
import { rooms } from "./resolvers/queries/rooms.js";
import { roomMembers } from "./resolvers/queries/roomMembers.js";
import { roomMembershipCandidates } from "./resolvers/queries/roomMembershipCandidates.js";
import { adminRooms } from "./resolvers/queries/adminRooms.js";
import { me } from "./resolvers/queries/me.js";
import { accessTokenExpiresAt } from "./resolvers/queries/accessTokenExpiresAt.js";
import type { MessageWithAuthor } from "../db/messages.js";

export const resolvers = {
  DateTime: DateTimeResolver,
  Query: {
    me,
    accessTokenExpiresAt,
    rooms,
    roomMembers,
    roomMembershipCandidates,
    messages,
    users,
    adminRooms,
  },
  Mutation: {
    register,
    login,
    logout,
    refresh,
    createRoom,
    joinRoom,
    addRoomMember,
    removeRoomMember,
    deleteRoom,
    deleteMessage,
    setGlobalRole,
    deactivateUser,
    reactivateUser,
  },
  Message: {
    content: (parent: MessageWithAuthor) =>
      parent.deletedAt ? "[message deleted]" : parent.content,
    username: (parent: MessageWithAuthor) => parent.user.username,
    mentionedUsernames: (parent: MessageWithAuthor) =>
      parent.mentions.map((m) => m.user.username),
  },
};
