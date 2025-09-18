import { createTRPCRouter } from "./init";
import { episodesRouter } from "./routers/episodes";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
});

export type AppRouter = typeof appRouter;
