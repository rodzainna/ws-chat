import { Prisma } from "../generated/prisma/client.js";

export function isUniqueConstraintViolation(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

// with @prisma/adapter-pg, P2002 has no meta.target; the Postgres constraint
// name (e.g. "users_username_key") is under meta.driverAdapterError
export function getViolatedUniqueField(
  err: Prisma.PrismaClientKnownRequestError,
): string | null {
  if (err.code !== "P2002") return null;
  const meta = err.meta;
  const driverAdapterError = meta?.driverAdapterError as
    Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as
    Record<string, unknown> | undefined;
  const constraint = cause?.constraint as Record<string, unknown> | undefined;
  const index =
    typeof constraint?.index === "string" ? constraint.index : undefined;
  if (!index) return null;
  if (index.includes("username")) return "username";
  if (index.includes("email")) return "email";
  if (index.includes("name")) return "name";
  return null;
}
