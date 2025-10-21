import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { createMcpTRPCContext } from "@/server/trpc/context";
import { mcpRouter } from "@/server/trpc/routers/mcp";

const handler = async (req: Request) => {
  const context = await createMcpTRPCContext({ req });

  if (!context.mcpSession) {
    return new Response(null, {
      status: 401,
    });
  }

  const caller = mcpRouter.createCaller(context);

  return createMcpHandler(
    (server) => {
      server.tool(
        "list-flashcards",
        "List all flashcards for the authenticated user with pagination",
        {
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        },
        async ({ limit, offset }) => {
          const result = await caller.flashcards.list({ limit, offset });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        },
      );

      server.tool(
        "get-flashcard",
        "Get a specific flashcard by ID",
        { id: z.string() },
        async ({ id }) => {
          const flashcard = await caller.flashcards.get({ id });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(flashcard, null, 2),
              },
            ],
          };
        },
      );

      server.tool(
        "create-flashcard",
        "Create a new standalone flashcard",
        {
          front: z.string().min(1).max(500),
          back: z.string().min(1).max(5000),
          source: z.string().min(1).max(500),
          tags: z.array(z.string()).optional(),
        },
        async ({ front, back, source, tags }) => {
          const result = await caller.flashcards.create({
            front,
            back,
            source,
            tags,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Created flashcard with ID: ${result.id}`,
              },
            ],
          };
        },
      );

      server.tool(
        "update-flashcard",
        "Update an existing flashcard",
        {
          id: z.string(),
          front: z.string().min(1).max(500),
          back: z.string().min(1).max(5000),
          source: z.string().optional(),
          tags: z.array(z.string()).optional(),
        },
        async ({ id, front, back, source, tags }) => {
          await caller.flashcards.update({ id, front, back, source, tags });
          return {
            content: [
              {
                type: "text" as const,
                text: `Updated flashcard ${id}`,
              },
            ],
          };
        },
      );

      server.tool(
        "delete-flashcard",
        "Delete a flashcard by ID",
        { id: z.string() },
        async ({ id }) => {
          await caller.flashcards.delete({ id });
          return {
            content: [
              {
                type: "text" as const,
                text: `Deleted flashcard ${id}`,
              },
            ],
          };
        },
      );
    },
    {
      capabilities: {
        tools: {
          "list-flashcards": {
            description:
              "List all flashcards for the authenticated user with pagination",
          },
          "get-flashcard": {
            description: "Get a specific flashcard by ID",
          },
          "create-flashcard": {
            description: "Create a new standalone flashcard",
          },
          "update-flashcard": {
            description: "Update an existing flashcard",
          },
          "delete-flashcard": {
            description: "Delete a flashcard by ID",
          },
        },
      },
    },
    {
      redisUrl: process.env.UPSTASH_REDIS_REST_URL,
      basePath: "/api",
      verboseLogs: process.env.NODE_ENV === "development",
      maxDuration: 60,
    },
  )(req);
};

export { handler as DELETE, handler as GET, handler as POST };
