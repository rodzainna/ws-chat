import { DateTimeResolver } from "graphql-scalars";
import { register } from "./resolvers/register.js";
import { login } from "./resolvers/login.js";
import { logout } from "./resolvers/logout.js";
import { refresh } from "./resolvers/refresh.js";
import { createRoom } from "./resolvers/createRoom.js";
import { joinRoom } from "./resolvers/joinRoom.js";
import { addRoomMember } from "./resolvers/addRoomMember.js";
import { deleteRoom } from "./resolvers/deleteRoom.js";
import { deleteMessage } from "./resolvers/deleteMessage.js";
import { setGlobalRole } from "./resolvers/setGlobalRole.js";
import { deactivateUser } from "./resolvers/deactivateUser.js";
import { reactivateUser } from "./resolvers/reactivateUser.js";
import { messages } from "./resolvers/messages.js";
import { users } from "./resolvers/users.js";
import { rooms } from "./resolvers/rooms.js";
import { roomMembers } from "./resolvers/roomMembers.js";
import { adminRooms } from "./resolvers/adminRooms.js";
import { me } from "./resolvers/me.js";
import { accessTokenExpiresAt } from "./resolvers/accessTokenExpiresAt.js";
import type { MessageWithAuthor } from "../db/messages.js";

export const resolvers = {
  DateTime: DateTimeResolver,
  Query: {
    me,
    accessTokenExpiresAt,
    rooms,
    roomMembers,
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
