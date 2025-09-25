"use client";

import { UsersTable } from "@/components/admin/users-table";
import { useSession } from "@/lib/auth-client";

export default function AdminPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (!session?.user) {
    return <div>Please sign in to access admin panel</div>;
  }

  // Check if user has admin role
  const isAdmin = session.user.role === "admin";

  if (!isAdmin) {
    return <div>You don't have permission to access this page</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground">
          Manage users and system settings
        </p>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Users</h2>
          <UsersTable />
        </div>
      </div>
    </div>
  );
}
