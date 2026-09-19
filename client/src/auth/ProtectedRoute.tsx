import { Navigate, Outlet } from "react-router";
import { useAuth } from "./useAuth";
import { ChatConnectionProvider } from "@/ws/ChatConnectionProvider";

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
      <Outlet />
    </ChatConnectionProvider>
  );
}
