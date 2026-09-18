import { Outlet } from "react-router";
import { AppHeader } from "@/components/AppHeader";
import { RoomSidebar } from "@/components/RoomSidebar";

export function ChatLayout() {
  return (
    <div className="flex h-svh flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <RoomSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
