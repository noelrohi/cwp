import { createTRPCRouter } from "./init";
import { episodesRouter } from "./routers/episodes";
import { playgroundRouter } from "./routers/playground";
import { podcastsRouter } from "./routers/podcasts";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  podcasts: podcastsRouter,
  playground: playgroundRouter,
});

export type AppRouter = typeof appRouter;
