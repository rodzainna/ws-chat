const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export type FieldError = {
  field: string;
  message: string;
};

export function validateUsername(username: string): FieldError | null {
  if (!USERNAME_PATTERN.test(username.toLowerCase())) {
    return {
      field: "username",
      message:
        "Username must be 3-20 characters: lowercase letters, numbers, and underscores only",
    };
  }
  return null;
}

export function validateEmail(email: string): FieldError | null {
  if (!EMAIL_PATTERN.test(email)) {
    return { field: "email", message: "Email is not valid" };
  }
  return null;
}

export function validatePassword(password: string): FieldError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      field: "password",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  return null;
}
