import { hashPassword } from "../../auth/password.js";
import { establishSession } from "../../auth/session.js";
import {
  validateUsername,
  validateEmail,
  validatePassword,
  type FieldError,
} from "../../auth/validation.js";
import { createUser } from "../../db/users.js";
import { getViolatedUniqueField } from "../../db/prismaErrors.js";
import { Prisma, type User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import { toUserError, type GraphQLUserError } from "../userErrors.js";

type RegisterInput = { username: string; email: string; password: string };
type RegisterPayload = { user: User | null; userErrors: GraphQLUserError[] };

const DUPLICATE_MESSAGES: Record<string, string> = {
  username: "Username is already taken",
  email: "Email is already registered",
};

export async function register(
  _parent: unknown,
  { input }: { input: RegisterInput },
  context: GraphQLContext,
): Promise<RegisterPayload> {
  const validationErrors = [
    validateUsername(input.username),
    validateEmail(input.email),
    validatePassword(input.password),
  ].filter((error): error is FieldError => error !== null);

  if (validationErrors.length > 0) {
    return { user: null, userErrors: validationErrors.map(toUserError) };
  }

  const passwordHash = await hashPassword(input.password);

  let user: User;
  try {
    user = await createUser({
      username: input.username,
      email: input.email,
      passwordHash,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const field = getViolatedUniqueField(err);
      const message = field ? DUPLICATE_MESSAGES[field] : undefined;
      return {
        user: null,
        userErrors: [
          {
            field: field ? [field] : [],
            message: message ?? "That information is already in use",
          },
        ],
      };
    }
    throw err;
  }

  await establishSession(user.id, context.res);

  return { user, userErrors: [] };
}
