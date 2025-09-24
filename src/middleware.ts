import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const authRoutes = ["/sign-in", "/sign-up"];

const protectedRoutes = [
  "/artifacts",
  "/dashboard",
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
  const session = getSessionCookie(request);

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
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
