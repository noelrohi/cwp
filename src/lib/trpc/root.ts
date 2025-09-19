import { createTRPCRouter } from "./init";
import { episodesRouter } from "./routers/episodes";
import { feedbackRouter } from "./routers/feedback";
import { questionsRouter } from "./routers/questions";
import { usersRouter } from "./routers/users";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  episodes: episodesRouter,
  questions: questionsRouter,
  feedback: feedbackRouter,
});

export type AppRouter = typeof appRouter;
