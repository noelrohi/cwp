import { createTRPCRouter } from "./init";
import { episodesRouter } from "./routers/episodes";
import { podcastsRouter } from "./routers/podcasts";
import { signalsRouter } from "./routers/signals";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  podcasts: podcastsRouter,
  signals: signalsRouter,
});

export type AppRouter = typeof appRouter;
