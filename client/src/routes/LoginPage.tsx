import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { gql, useMutation } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/useAuth";
import { scheduleProactiveRefresh } from "@/lib/apollo";

type UserError = { field: string[]; message: string };
type AuthPayload = {
  user: { id: string } | null;
  accessTokenExpiresAt: string | null;
  userErrors: UserError[];
};

const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      user {
        id
      }
      accessTokenExpiresAt
      userErrors {
        field
        message
      }
    }
  }
`;

const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      user {
        id
      }
      accessTokenExpiresAt
      userErrors {
        field
        message
      }
    }
  }
`;

export function LoginPage() {
  const { user, loading, refetchUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<UserError[]>([]);

  const [login, { loading: loggingIn }] = useMutation<
    { login: AuthPayload },
    { input: { username: string; password: string } }
  >(LOGIN_MUTATION);
  const [register, { loading: registering }] = useMutation<
    { register: AuthPayload },
    { input: { username: string; email: string; password: string } }
  >(REGISTER_MUTATION);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleAuthResult(payload: AuthPayload | undefined) {
    if (!payload?.user) {
      setErrors(payload?.userErrors ?? []);
      return;
    }
    if (payload.accessTokenExpiresAt) {
      scheduleProactiveRefresh(
        new Date(payload.accessTokenExpiresAt).getTime(),
      );
    }
    await refetchUser();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);

    if (mode === "login") {
      const result = await login({
        variables: { input: { username, password } },
      });
      await handleAuthResult(result.data?.login);
    } else {
      const result = await register({
        variables: { input: { username, email, password } },
      });
      await handleAuthResult(result.data?.register);
    }
  }

  const busy = loggingIn || registering;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "login" ? "Log in" : "Create an account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </div>

            {errors.length > 0 && (
              <ul className="space-y-1 text-sm text-destructive">
                {errors.map((error, index) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:underline"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setErrors([]);
            }}
          >
            {mode === "login"
              ? "Need an account? Register"
              : "Already have an account? Log in"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
