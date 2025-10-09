import { createTRPCRouter } from "./init";
import { adminRouter } from "./routers/admin";
import { articlesRouter } from "./routers/articles";
import { episodesRouter } from "./routers/episodes";
import { flashcardsRouter } from "./routers/flashcards";
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
  articles: articlesRouter,
  flashcards: flashcardsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
