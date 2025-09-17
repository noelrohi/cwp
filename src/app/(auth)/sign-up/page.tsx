"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconBrandGoogle, IconBrandLinkedin } from "@tabler/icons-react";
import { signIn } from "@/lib/auth-client";

export default function SignUpPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-muted-foreground text-sm">
            Use a provider to get started quickly.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => signIn.social({ provider: "google" })}
            className="justify-start"
          >
            <IconBrandGoogle className="size-4" />
            Continue with Google
          </Button>
          <Button
            variant="outline"
            onClick={() => signIn.social({ provider: "linkedin" })}
            className="justify-start"
          >
            <IconBrandLinkedin className="size-4" />
            Continue with LinkedIn
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and acknowledge our{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link href="/sign-in" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
