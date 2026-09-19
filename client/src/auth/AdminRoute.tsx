import { Navigate, Outlet } from "react-router";
import { useAuth } from "./useAuth";

export function AdminRoute() {
  const { user } = useAuth();

  if (user?.globalRole !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
