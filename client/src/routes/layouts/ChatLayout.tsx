import { useState } from "react";
import { Outlet } from "react-router";
import { AppHeader } from "@/components/layout/AppHeader";
import { RoomSidebar } from "@/components/chat/RoomSidebar";

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
