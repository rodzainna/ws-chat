import type { FieldError } from "../auth/validation.js";

export type GraphQLUserError = { field: string[]; message: string };

export function toUserError(error: FieldError): GraphQLUserError {
  return { field: [error.field], message: error.message };
}
