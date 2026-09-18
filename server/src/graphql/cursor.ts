import { GraphQLError } from "graphql";

export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!decoded) {
    throw new GraphQLError("Invalid cursor", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return decoded;
}
