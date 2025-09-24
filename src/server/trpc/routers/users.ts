import { eq } from "drizzle-orm";
import { z } from "zod";
import { user as usersTable } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const usersRouter = createTRPCRouter({
  getUsers: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.select().from(usersTable);
  }),

  getUserById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.id));
      return user;
    }),
});
