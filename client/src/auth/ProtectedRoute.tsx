import { useEffect } from "react";
import { Navigate, Outlet, useNavigate } from "react-router";
import { useAuth } from "./useAuth";
import { ChatConnectionProvider } from "@/ws/ChatConnectionProvider";
import { useChatConnection } from "@/ws/useChatConnection";

function GlobalSessionExpiredHandler() {
  const { subscribe } = useChatConnection();
  const navigate = useNavigate();

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "session_expired") {
        void navigate("/login", { replace: true });
      }
    });
  }, [subscribe, navigate]);

  return null;
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
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
      <Outlet />
    </ChatConnectionProvider>
  );
}
