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

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
