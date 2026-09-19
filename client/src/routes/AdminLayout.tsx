import { Outlet } from "react-router";
import { AppHeader } from "@/components/AppHeader";

export function AdminLayout() {
  return (
    <div className="flex h-svh flex-col">
      <AppHeader />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
