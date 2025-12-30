import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { userExportSettings } from "@/server/db/schema/podcast";
import { createTRPCRouter, protectedProcedure } from "../init";

export const exportsRouter = createTRPCRouter({
  // Get export settings (last sync date)
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(userExportSettings)
      .where(eq(userExportSettings.userId, ctx.user.id))
      .limit(1);

    return settings ?? null;
  }),

  // Update last exported timestamp manually
  updateLastExportedAt: protectedProcedure.mutation(async ({ ctx }) => {
    const existingSettings = await ctx.db
      .select()
      .from(userExportSettings)
      .where(eq(userExportSettings.userId, ctx.user.id))
      .limit(1);

    if (existingSettings.length > 0) {
      await ctx.db
        .update(userExportSettings)
        .set({ lastExportedAt: new Date() })
        .where(eq(userExportSettings.userId, ctx.user.id));
    } else {
      await ctx.db.insert(userExportSettings).values({
        id: nanoid(),
        userId: ctx.user.id,
        lastExportedAt: new Date(),
      });
    }

    return { success: true };
  }),
});
