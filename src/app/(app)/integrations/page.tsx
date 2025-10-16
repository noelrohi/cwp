"use client";

import { CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTRPC } from "@/server/trpc/client";

export default function IntegrationsPage() {
  const trpc = useTRPC();
  const integrations = useQuery(trpc.integrations.list.queryOptions());

  const readwiseIntegration = integrations.data?.find(
    (i) => i.provider === "readwise",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect external services to sync content into your library
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/integrations/readwise">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Readwise
                {readwiseIntegration && (
                  <span className="inline-flex items-center gap-1 text-sm font-normal text-green-600 dark:text-green-400">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} />
                    Connected
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Sync documents from books, articles, and newsletters
              </CardDescription>
            </CardHeader>
            <CardContent>
              {readwiseIntegration ? (
                <p className="text-sm text-muted-foreground">
                  {(readwiseIntegration.metadata?.totalItemsSynced as number) ||
                    0}{" "}
                  documents synced
                </p>
              ) : (
                <Button variant="outline" size="sm" className="w-full">
                  Connect
                </Button>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
