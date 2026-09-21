import { Link, useNavigate } from "react-router";
import { gql, useMutation } from "@apollo/client";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/useAuth";

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout {
      success
    }
  }
`;

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, clearUser } = useAuth();
  const navigate = useNavigate();
  const [logout] = useMutation(LOGOUT_MUTATION);

  async function handleLogout() {
    try {
      await logout();
    } catch {
    } finally {
      clearUser();
      void navigate("/login", { replace: true });
    }
  }

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
            aria-label="Open room list"
          >
            <MenuIcon />
          </Button>
        )}
        <Link to="/" className="font-semibold">
          Chat
        </Link>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {user?.globalRole === "ADMIN" && (
          <Link to="/admin" className="text-muted-foreground hover:underline">
            Admin
          </Link>
        )}
        <span className="text-muted-foreground">{user?.username}</span>
        <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
          Log out
        </Button>
      </div>
    </header>
  );
}
