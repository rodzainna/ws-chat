import type { FieldError } from "../auth/validation.js";

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 50;

export function validateRoomName(name: string): FieldError | null {
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    return {
      field: "name",
      message: `Room name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters`,
    };
  }
  return null;
}
