import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { setSessionExpiredHandler } from "@/lib/apollo";
import { AuthProvider } from "@/auth/AuthContext";
import { useAuth } from "@/auth/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { expireSession } from "@/ws/sessionExpiredMessages";

function SessionExpiredWiring() {
  const navigate = useNavigate();
  const { clearUser } = useAuth();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      expireSession(navigate, clearUser);
    });
  }, [navigate, clearUser]);

  return null;
}

export function RootLayout() {
  return (
    <AuthProvider>
      <SessionExpiredWiring />
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
