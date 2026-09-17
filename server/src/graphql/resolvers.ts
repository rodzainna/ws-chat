import { DateTimeResolver } from "graphql-scalars";
import { register } from "./resolvers/register.js";
import { login } from "./resolvers/login.js";
import { logout } from "./resolvers/logout.js";
import { me } from "./resolvers/me.js";

export const resolvers = {
  DateTime: DateTimeResolver,
  Query: {
    me,
  },
  Mutation: {
    register,
    login,
    logout,
  },
};
