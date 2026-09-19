import { AdminUsersSection } from "@/components/AdminUsersSection";
import { AdminRoomsSection } from "@/components/AdminRoomsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-lg font-semibold">Admin</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <AdminUsersSection />
        </TabsContent>
        <TabsContent value="rooms">
          <AdminRoomsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
