import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";

export async function createTRPCContext(opts?: { req?: NextRequest }) {
  const session = opts?.req
    ? await auth.api.getSession({ headers: opts.req.headers })
    : null;

  return {
    db,
    session: session?.session ?? null,
    user: session?.user ?? null,
  };
}

export async function createMcpTRPCContext(opts: {
  req: NextRequest | Request;
}) {
  const mcpSession = await auth.api.getMcpSession({
    headers: opts.req.headers,
  });

  return {
    db,
    mcpSession,
    userId: mcpSession?.userId ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
export type McpContext = Awaited<ReturnType<typeof createMcpTRPCContext>>;
