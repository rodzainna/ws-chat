import { DateTimeResolver } from "graphql-scalars";
import { register } from "./resolvers/register.js";
import { login } from "./resolvers/login.js";

function notImplemented(): never {
  throw new Error("Not implemented yet");
}

export const resolvers = {
  DateTime: DateTimeResolver,
  Query: {
    me: notImplemented,
  },
  Mutation: {
    register,
    login,
    logout: notImplemented,
  },
};
