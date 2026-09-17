import { DateTimeResolver } from "graphql-scalars";

function notImplemented(): never {
  throw new Error("Not implemented yet");
}

export const resolvers = {
  DateTime: DateTimeResolver,
  Query: {
    me: notImplemented,
  },
  Mutation: {
    register: notImplemented,
    login: notImplemented,
    logout: notImplemented,
  },
};
