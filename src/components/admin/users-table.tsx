"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";

export function UsersTable() {
  const { data: usersResponse, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await authClient.admin.listUsers({
        query: {
          limit: 100,
        },
      });
      return response.data;
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await authClient.admin.impersonateUser({
        userId,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success("Successfully impersonating user");
      // Refresh the page to show the impersonated session
      window.location.reload();
    },
    onError: (error) => {
      console.error("Impersonation failed:", error);
      toast.error("Failed to impersonate user");
    },
  });

  const handleImpersonate = (userId: string) => {
    impersonateMutation.mutate(userId);
  };

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  const users = usersResponse?.users || [];

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                >
                  {user.role || "user"}
                </Badge>
              </TableCell>
              <TableCell>
                {user.banned ? (
                  <Badge variant="destructive">Banned</Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </TableCell>
              <TableCell>
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleImpersonate(user.id)}
                  disabled={impersonateMutation.isPending}
                >
                  {impersonateMutation.isPending
                    ? "Impersonating..."
                    : "Impersonate"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
