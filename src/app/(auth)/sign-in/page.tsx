"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Google } from "@/components/ui/svgs/google";
import { authClient, signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const lastMethod = authClient.getLastUsedLoginMethod();
  const [isPending, startTransition] = useTransition();
  const handleSignIn = () => {
    startTransition(() => {
      signIn.social({ provider: "google" });
    });
  };
  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Continue with one of the providers below.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={handleSignIn}
            disabled={isPending}
            className="justify-start relative"
          >
            <Google className="size-4" />
            Continue with Google
            {lastMethod === "google" && (
              <Badge className="absolute -top-2 -right-2">Last used</Badge>
            )}
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
