import { createTRPCRouter } from "./init";
import { adminRouter } from "./routers/admin";
import { articlesRouter } from "./routers/articles";
import { episodesRouter } from "./routers/episodes";
import { exportsRouter } from "./routers/exports";
import { favoritesRouter } from "./routers/favorites";
import { flashcardsRouter } from "./routers/flashcards";
import { integrationsRouter } from "./routers/integrations";
import { metaSignalsRouter } from "./routers/meta-signals";
import { podcastsRouter } from "./routers/podcasts";
import { ragRouter } from "./routers/rag";
import { readwiseRouter } from "./routers/readwise";
import { signalsRouter } from "./routers/signals";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  podcasts: podcastsRouter,
  signals: signalsRouter,
  metaSignals: metaSignalsRouter,
  rag: ragRouter,
  articles: articlesRouter,
  flashcards: flashcardsRouter,
  favorites: favoritesRouter,
  admin: adminRouter,
  integrations: integrationsRouter,
  readwise: readwiseRouter,
  exports: exportsRouter,
});

export type AppRouter = typeof appRouter;
