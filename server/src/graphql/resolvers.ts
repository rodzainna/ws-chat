import { DateTimeResolver } from "graphql-scalars";
import { register } from "./resolvers/register.js";

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
    login: notImplemented,
    logout: notImplemented,
  },
};
