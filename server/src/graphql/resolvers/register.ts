import { hashPassword } from "../../auth/password.js";
import { tryConsumeRegistrationToken } from "../../auth/registrationRateLimit.js";
import { getMaxUsers } from "../../env.js";
import { establishSession } from "../../auth/session.js";
import {
  validateUsername,
  validateEmail,
  validatePassword,
  type FieldError,
} from "../../auth/validation.js";
import { countUsers, createUser } from "../../db/users.js";
import {
  getViolatedUniqueField,
  isUniqueConstraintViolation,
} from "../../db/prismaErrors.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import { toUserError, type GraphQLUserError } from "../userErrors.js";

type RegisterInput = { username: string; email: string; password: string };
type RegisterPayload = {
  user: User | null;
  accessTokenExpiresAt: Date | null;
  userErrors: GraphQLUserError[];
};

const DUPLICATE_MESSAGES: Record<string, string> = {
  username: "Username is already taken",
  email: "Email is already registered",
};

const REGISTRATION_CLOSED: GraphQLUserError = {
  field: [],
  message: "Registration is closed. Try one of the demo accounts.",
};

const RATE_LIMITED: GraphQLUserError = {
  field: [],
  message: "Too many sign-ups from your network. Please try again later.",
};

export async function register(
  _parent: unknown,
  { input }: { input: RegisterInput },
  context: GraphQLContext,
): Promise<RegisterPayload> {
  // the cap doesn't cost a token; the rate limit runs before validation and
  // bcrypt so invalid spam still costs tokens
  if ((await countUsers()) >= getMaxUsers()) {
    return failure(REGISTRATION_CLOSED);
  }
  if (!tryConsumeRegistrationToken(context.req.ip)) {
    return failure(RATE_LIMITED);
  }

  const validationErrors = [
    validateUsername(input.username),
    validateEmail(input.email),
    validatePassword(input.password),
  ].filter((error): error is FieldError => error !== null);

  if (validationErrors.length > 0) {
    return {
      user: null,
      accessTokenExpiresAt: null,
      userErrors: validationErrors.map(toUserError),
    };
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
    if (isUniqueConstraintViolation(err)) {
      const field = getViolatedUniqueField(err);
      const message = field ? DUPLICATE_MESSAGES[field] : undefined;
      return {
        user: null,
        accessTokenExpiresAt: null,
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

  const { accessTokenExpiresAt } = await establishSession(user.id, context.res);

  return { user, accessTokenExpiresAt, userErrors: [] };
}

function failure(error: GraphQLUserError): RegisterPayload {
  return { user: null, accessTokenExpiresAt: null, userErrors: [error] };
}
