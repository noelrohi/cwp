import type { Metadata } from "next";
import DatabaseSchemaGraph from "@/components/database-schema-graph";

export const metadata: Metadata = {
  title: "Database Schema - CWP",
  description:
    "Interactive visualization of the podcast database schema and relationships",
};

export default function SchemaPage() {
  return (
    <div className="h-screen w-full">
      <DatabaseSchemaGraph />
    </div>
  );
}
