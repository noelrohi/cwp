"use client";

import { InngestTriggers } from "@/components/admin/inngest-triggers";
import { UsersTable } from "@/components/admin/users-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground">
          Manage users and trigger system functions
        </p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="functions">Background Functions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UsersTable />
        </TabsContent>

        <TabsContent value="functions" className="mt-6">
          <InngestTriggers />
        </TabsContent>
      </Tabs>
    </main>
  );
}
