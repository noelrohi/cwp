import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createMcpTRPCContext } from "@/server/trpc/context";
import { mcpRouter } from "@/server/trpc/routers/mcp";

const isDev = process.env.NODE_ENV === "development";

const handler = async (req: Request) => {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    console.error("[MCP] UPSTASH_REDIS_REST_URL is not configured");
    return new Response(
      JSON.stringify({
        error: "Server configuration error: Redis URL not configured",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (isDev) {
    console.log("[MCP] Incoming request to MCP handler");
    console.log("[MCP] Request URL:", req.url);
    console.log("[MCP] Request method:", req.method);
  }

  const context = await createMcpTRPCContext({ req });

  if (isDev) {
    console.log("[MCP] Context created:", {
      hasMcpSession: !!context.mcpSession,
      userId: context.userId,
    });
  }

  if (!context.mcpSession) {
    console.error("[MCP] Authentication failed: No MCP session found");
    console.error("[MCP] Headers:", Object.fromEntries(req.headers.entries()));
    return new Response(
      JSON.stringify({
        error: "Authentication failed: No valid MCP session found",
        details: "Please ensure you are properly authenticated",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!context.userId) {
    console.error(
      "[MCP] Authentication failed: MCP session exists but no userId",
    );
    return new Response(
      JSON.stringify({
        error: "Authentication failed: Invalid session",
        details: "Session exists but user ID is missing",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const caller = mcpRouter.createCaller(context);

  return createMcpHandler(
    (server) => {
      server.tool(
        "list-flashcards",
        "List all flashcards for the authenticated user with pagination",
        {
          limit: z
            .number()
            .min(1)
            .max(100)
            .optional()
            .describe("Maximum number of flashcards to return (1-100)"),
          offset: z
            .number()
            .min(0)
            .optional()
            .describe("Number of flashcards to skip for pagination"),
        },
        async ({ limit, offset }) => {
          try {
            const result = await caller.flashcards.list({ limit, offset });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            console.error("[MCP] list-flashcards error:", error);
            throw error;
          }
        },
      );

      server.tool(
        "get-flashcard",
        "Get a specific flashcard by ID",
        { id: z.string().describe("Unique identifier of the flashcard") },
        async ({ id }) => {
          try {
            const flashcard = await caller.flashcards.get({ id });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(flashcard, null, 2),
                },
              ],
            };
          } catch (error) {
            console.error("[MCP] get-flashcard error:", error);
            throw error;
          }
        },
      );

      server.tool(
        "create-flashcard",
        "Create a new standalone flashcard",
        {
          front: z
            .string()
            .min(1)
            .max(500)
            .describe("Front side of the flashcard (question/prompt)"),
          back: z
            .string()
            .min(1)
            .max(5000)
            .describe("Back side of the flashcard (answer/explanation)"),
          source: z
            .string()
            .min(1)
            .max(500)
            .describe("Source or origin of the flashcard content"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Optional tags for categorizing the flashcard"),
        },
        async ({ front, back, source, tags }) => {
          try {
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
          } catch (error) {
            console.error("[MCP] create-flashcard error:", error);
            throw error;
          }
        },
      );

      server.tool(
        "update-flashcard",
        "Update an existing flashcard",
        {
          id: z
            .string()
            .describe("Unique identifier of the flashcard to update"),
          front: z
            .string()
            .min(1)
            .max(500)
            .describe("Front side of the flashcard (question/prompt)"),
          back: z
            .string()
            .min(1)
            .max(5000)
            .describe("Back side of the flashcard (answer/explanation)"),
          source: z
            .string()
            .optional()
            .describe("Source or origin of the flashcard content"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Optional tags for categorizing the flashcard"),
        },
        async ({ id, front, back, source, tags }) => {
          try {
            await caller.flashcards.update({ id, front, back, source, tags });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Updated flashcard ${id}`,
                },
              ],
            };
          } catch (error) {
            console.error("[MCP] update-flashcard error:", error);
            throw error;
          }
        },
      );

      server.tool(
        "delete-flashcard",
        "Delete a flashcard by ID",
        {
          id: z
            .string()
            .describe("Unique identifier of the flashcard to delete"),
        },
        async ({ id }) => {
          try {
            await caller.flashcards.delete({ id });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Deleted flashcard ${id}`,
                },
              ],
            };
          } catch (error) {
            console.error("[MCP] delete-flashcard error:", error);
            throw error;
          }
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
      verboseLogs: isDev,
      maxDuration: 60,
    },
  )(req);
};

export { handler as DELETE, handler as GET, handler as POST };
