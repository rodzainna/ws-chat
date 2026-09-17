import { verifyPassword, hashPassword } from "../../auth/password.js";
import { issueToken } from "../../auth/jwt.js";
import { generateRefreshToken } from "../../auth/refreshToken.js";
import { setAuthCookies } from "../../auth/cookies.js";
import { findUserByUsername } from "../../db/users.js";
import { createRefreshTokenRecord } from "../../db/refreshTokens.js";
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

let cachedDummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = await hashPassword("only-used-to-equalize-login-timing");
  }
  return cachedDummyHash;
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

  const accessToken = await issueToken(user.id);
  const refreshToken = generateRefreshToken();
  await createRefreshTokenRecord(user.id, refreshToken);
  setAuthCookies(context.res, { accessToken, refreshToken });

  return { user, userErrors: [] };
}
