import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { MyUIMessage } from "@/ai/schema";
import { user } from "./auth";

export const chatSession = pgTable("chat_session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  messages: jsonb("messages").$type<MyUIMessage[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
