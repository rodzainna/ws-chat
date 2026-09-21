import { useState } from "react";
import { Outlet } from "react-router";
import { AppHeader } from "@/components/AppHeader";
import { RoomSidebar } from "@/components/RoomSidebar";

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-svh flex-col">
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <RoomSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
