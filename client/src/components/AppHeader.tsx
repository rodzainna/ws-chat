import { Link, useNavigate } from "react-router";
import { gql, useMutation } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout {
      success
    }
  }
`;

export function AppHeader() {
  const { user, clearUser } = useAuth();
  const navigate = useNavigate();
  const [logout] = useMutation(LOGOUT_MUTATION);

  async function handleLogout() {
    await logout();
    clearUser();
    void navigate("/login", { replace: true });
  }

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link to="/" className="font-semibold">
        Chat
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{user?.username}</span>
        <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
          Log out
        </Button>
      </div>
    </header>
  );
}
