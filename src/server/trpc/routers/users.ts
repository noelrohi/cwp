import { eq } from "drizzle-orm";
import { z } from "zod";
import { user as usersTable } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const usersRouter = createTRPCRouter({
  getUsers: protectedProcedure.query(async ({ ctx }) => {
    // Only allow users to see their own data for security
    const [user] = await ctx.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, ctx.user.id));
    return [user];
  }),

  getUserById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Only allow users to access their own data
      if (input.id !== ctx.user.id) {
        throw new Error("Access denied");
      }

      const [user] = await ctx.db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.id));
      return user;
    }),
});
