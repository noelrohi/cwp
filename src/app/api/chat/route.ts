import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { auth } from "@/lib/auth";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "X-Title": "cwp",
  },
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // Get the session to ensure user is authenticated
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openrouter("openai/gpt-5-codex"),
    messages: convertToModelMessages(messages),
    system: `You are a helpful AI assistant for Framebreak Intelligence, a podcast intelligence platform. 
You help users understand and interact with podcast content, episodes, and insights.
Be concise, friendly, and helpful.`,
  });

  return result.toUIMessageStreamResponse();
}
