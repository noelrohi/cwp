import { createTRPCRouter } from "./init";
import { episodesRouter } from "./routers/episodes";
import { podcastsRouter } from "./routers/podcasts";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  podcasts: podcastsRouter,
});

export type AppRouter = typeof appRouter;
