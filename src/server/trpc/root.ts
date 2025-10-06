import { createTRPCRouter } from "./init";
import { episodesRouter } from "./routers/episodes";
import { podcastsRouter } from "./routers/podcasts";
import { ragRouter } from "./routers/rag";
import { signalsRouter } from "./routers/signals";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  podcasts: podcastsRouter,
  signals: signalsRouter,
  rag: ragRouter,
});

export type AppRouter = typeof appRouter;
