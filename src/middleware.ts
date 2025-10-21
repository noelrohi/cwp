import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "./lib/auth";

const authRoutes = ["/sign-in", "/sign-up"];

const protectedRoutes = [
  "/artifacts",
  "/dashboard",
  "/chat",
  "/episode",
  "/playground",
  "/podcast",
  "/podcasts",
  "/preferences",
  "/settings",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log({ pathname });
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // If user is authenticated but trying to access auth routes
  if (session && authRoutes.some((route) => pathname.startsWith(route))) {
    console.log("Redirecting to home");
    console.log("Session cookie: ", session);
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!session && protectedRoutes.some((route) => pathname.startsWith(route))) {
    console.log("Redirecting to sign in");
    console.log("Session cookie: ", session);
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(.well-known)(.*)",
    "/(api|trpc)(.*)",
  ],
};
