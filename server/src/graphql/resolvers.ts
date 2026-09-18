import { DateTimeResolver } from "graphql-scalars";
import { register } from "./resolvers/register.js";
import { login } from "./resolvers/login.js";
import { logout } from "./resolvers/logout.js";
import { refresh } from "./resolvers/refresh.js";
import { createRoom } from "./resolvers/createRoom.js";
import { joinRoom } from "./resolvers/joinRoom.js";
import { addRoomMember } from "./resolvers/addRoomMember.js";
import { messages } from "./resolvers/messages.js";
import { me } from "./resolvers/me.js";
import type { Message } from "../generated/prisma/client.js";

export const resolvers = {
  DateTime: DateTimeResolver,
  Query: {
    me,
    messages,
  },
  Mutation: {
    register,
    login,
    logout,
    refresh,
    createRoom,
    joinRoom,
    addRoomMember,
  },
  Message: {
    content: (parent: Message) =>
      parent.deletedAt ? "[message deleted]" : parent.content,
  },
};
