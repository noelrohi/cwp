import { createTRPCRouter } from "./init";
import { adminRouter } from "./routers/admin";
import { articlesRouter } from "./routers/articles";
import { episodesRouter } from "./routers/episodes";
import { exportsRouter } from "./routers/exports";
import { favoritesRouter } from "./routers/favorites";
import { integrationsRouter } from "./routers/integrations";
import { podcastsRouter } from "./routers/podcasts";
import { readwiseRouter } from "./routers/readwise";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  podcasts: podcastsRouter,
  articles: articlesRouter,
  favorites: favoritesRouter,
  admin: adminRouter,
  integrations: integrationsRouter,
  readwise: readwiseRouter,
  exports: exportsRouter,
});

export type AppRouter = typeof appRouter;
