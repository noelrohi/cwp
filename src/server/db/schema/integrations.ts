import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export type IntegrationMetadata = {
  lastSyncAt?: string;
  totalItemsSynced?: number;
  autoSync?: boolean;
  [key: string]: unknown;
};

export const integration = pgTable(
  "integration",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(),
    metadata: jsonb("metadata").$type<IntegrationMetadata>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.provider),
    unique().on(table.userId, table.provider),
  ],
);

export const integrationRelations = relations(integration, ({ one }) => ({
  user: one(user, {
    fields: [integration.userId],
    references: [user.id],
  }),
}));
