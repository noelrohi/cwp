import { lastLoginMethodClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    process.env.NODE_ENV === "production"
      ? "https://framebreak-intelligence.vercel.app"
      : "http://localhost:3000",
  plugins: [lastLoginMethodClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
