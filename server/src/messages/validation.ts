import type { FieldError } from "../auth/validation.js";

export const MAX_CONTENT_LENGTH = 2000;

export function validateMessageContent(content: string): FieldError | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { field: "content", message: "Message cannot be empty" };
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    return {
      field: "content",
      message: `Message must be at most ${MAX_CONTENT_LENGTH} characters`,
    };
  }
  return null;
}
