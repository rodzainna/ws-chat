import { verifyPassword, hashPassword } from "../../auth/password.js";
import { establishSession } from "../../auth/session.js";
import { findUserByUsername } from "../../db/users.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type LoginInput = { username: string; password: string };
type LoginPayload = { user: User | null; userErrors: GraphQLUserError[] };

// same message for unknown user, wrong password, or deactivated account, so
// it doesn't reveal which usernames exist
const INVALID_CREDENTIALS: GraphQLUserError = {
  field: [],
  message: "Invalid username or password",
};

// compared against when the user doesn't exist, so response time doesn't
// reveal valid usernames. Caches the promise; cleared on rejection.
let cachedDummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  if (!cachedDummyHashPromise) {
    cachedDummyHashPromise = hashPassword(
      "only-used-to-equalize-login-timing",
    ).catch((err: unknown) => {
      cachedDummyHashPromise = undefined;
      throw err;
    });
  }
  return cachedDummyHashPromise;
}

export async function login(
  _parent: unknown,
  { input }: { input: LoginInput },
  context: GraphQLContext,
): Promise<LoginPayload> {
  const user = await findUserByUsername(input.username);
  if (!user) {
    await verifyPassword(input.password, await getDummyHash());
    return { user: null, userErrors: [INVALID_CREDENTIALS] };
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );
  if (!passwordMatches || !user.isActive) {
    return { user: null, userErrors: [INVALID_CREDENTIALS] };
  }

  await establishSession(user.id, context.res);

  return { user, userErrors: [] };
}
