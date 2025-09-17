"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export function UserList() {
  const trpc = useTRPC();
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    age: 0,
  });

  // Query to get all users
  const usersQuery = useQuery(trpc.users.getUsers.queryOptions());

  // Mutation to create a new user
  const createUserMutation = useMutation(
    trpc.users.createUser.mutationOptions({
      onSuccess: () => {
        // Invalidate and refetch users query
        usersQuery.refetch();
        // Reset form
        setNewUser({ name: "", email: "", age: 0 });
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(newUser);
  };

  if (usersQuery.isLoading) return <div>Loading users...</div>;
  if (usersQuery.error) return <div>Error loading users</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Users</h2>

      {/* User List */}
      <div className="space-y-2">
        {usersQuery.data?.map((user) => (
          <div key={user.id} className="p-4 border rounded-lg">
            <p>
              <strong>Name:</strong> {user.name}
            </p>
            <p>
              <strong>Email:</strong> {user.email}
            </p>
            <p>
              <strong>Age:</strong> {user.age}
            </p>
          </div>
        ))}
      </div>

      {/* Create User Form */}
      <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold">Add New User</h3>

        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            type="number"
            value={newUser.age || ""}
            onChange={(e) =>
              setNewUser({ ...newUser, age: parseInt(e.target.value) || 0 })
            }
            required
          />
        </div>

        <Button type="submit" disabled={createUserMutation.isPending}>
          {createUserMutation.isPending ? "Creating..." : "Create User"}
        </Button>
      </form>
    </div>
  );
}
