// Server exports
export { appRouter, type AppRouter } from "./root";
export { createTRPCContext, type Context } from "./context";
export {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "./init";

// Client exports
export {
  useTRPC,
  useTRPCClient,
  TRPCProvider,
  getQueryClient,
  makeQueryClient,
} from "./client";
