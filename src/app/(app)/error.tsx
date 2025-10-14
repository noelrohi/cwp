"use client";

import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="size-12 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            We encountered an unexpected error. Please try again or return to
            the home page.
          </p>
        </div>

        {error.message && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
            <p className="text-xs font-mono text-destructive/80">
              {error.message}
            </p>
          </div>
        )}

        {error.digest && (
          <div className="text-xs text-muted-foreground">
            Error ID: {error.digest}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default">
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">
              <Home className="size-4" />
              Go to dashboard
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
