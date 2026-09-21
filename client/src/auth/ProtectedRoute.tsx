import { useEffect } from "react";
import { Navigate, Outlet, useNavigate } from "react-router";
import { useAuth } from "./useAuth";
import { ChatConnectionProvider } from "@/ws/ChatConnectionProvider";
import { useChatConnection } from "@/ws/useChatConnection";
import { expireSession } from "@/ws/sessionExpiredMessages";
import { attemptRefresh, beginReauthRecovery } from "@/lib/apollo";
import { ReauthBanner } from "@/components/ReauthBanner";

function GlobalSessionExpiredHandler() {
  const { subscribe } = useChatConnection();
  const { clearUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== "session_expired") return;

      if (event.reason === "logged_out") {
        expireSession(navigate, clearUser);
        return;
      }

      if (event.reason === "token_expired") {
        void attemptRefresh().then((refreshed) => {
          if (!refreshed) beginReauthRecovery("Reconnecting your session…");
        });
        return;
      }

      beginReauthRecovery("Your account has been deactivated.");
    });
  }, [subscribe, clearUser, navigate]);

  return null;
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ChatConnectionProvider>
      <GlobalSessionExpiredHandler />
      <ReauthBanner />
      <Outlet />
    </ChatConnectionProvider>
  );
}
