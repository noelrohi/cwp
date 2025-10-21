import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { createMcpTRPCContext } from "@/server/trpc/context";
import { mcpRouter } from "@/server/trpc/routers/mcp";

const isDev = process.env.NODE_ENV === "development";

const handler = async (req: Request) => {
  try {
    // Validate environment configuration
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
      console.error(
        "[MCP] Headers:",
        Object.fromEntries(req.headers.entries()),
      );
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
        verboseLogs: isDev,
        maxDuration: 60,
      },
    )(req);
  } catch (error) {
    console.error("[MCP] Handler error:", error);
    console.error(
      "[MCP] Error stack:",
      error instanceof Error ? error.stack : "No stack trace",
    );

    // Extract error message
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorDetails =
      error instanceof Error && error.stack
        ? error.stack.split("\n").slice(0, 3).join("\n")
        : "No additional details available";

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        details: isDev ? errorDetails : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export { handler as DELETE, handler as GET, handler as POST };
