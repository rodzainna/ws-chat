import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { setSessionExpiredHandler } from "@/lib/apollo";
import { AuthProvider } from "@/auth/AuthContext";
import { Toaster } from "@/components/ui/sonner";

export function RootLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      void navigate("/login", { replace: true });
    });
  }, [navigate]);

  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
