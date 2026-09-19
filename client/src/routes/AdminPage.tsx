import { AdminUsersSection } from "@/components/AdminUsersSection";

export function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-lg font-semibold">Admin</h1>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Users</h2>
        <AdminUsersSection />
      </section>
    </div>
  );
}
