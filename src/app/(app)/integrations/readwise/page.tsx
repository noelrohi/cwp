"use client";

import {
  CheckmarkCircle01Icon,
  DatabaseSync01Icon,
  Loading03Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ReadwiseSyncDialog } from "@/components/blocks/integrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/server/trpc/client";

export default function IntegrationsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [readwiseToken, setReadwiseToken] = useState("");
  const [showConnectDialog, setShowConnectDialog] = useState(false);

  const integrations = useQuery(trpc.integrations.list.queryOptions());

  const readwiseIntegration = integrations.data?.find(
    (i) => i.provider === "readwise",
  );

  const connectMutation = useMutation(
    trpc.integrations.connectReadwise.mutationOptions({
      onSuccess: () => {
        toast.success("Readwise connected successfully!");
        queryClient.invalidateQueries({
          queryKey: trpc.integrations.list.queryKey(),
        });
        setShowConnectDialog(false);
        setReadwiseToken("");
      },
      onError: (error) => {
        toast.error(`Failed to connect: ${error.message}`);
      },
    }),
  );

  const disconnectMutation = useMutation(
    trpc.integrations.disconnect.mutationOptions({
      onSuccess: () => {
        toast.success("Readwise disconnected");
        queryClient.invalidateQueries({
          queryKey: trpc.integrations.list.queryKey(),
        });
      },
      onError: (error) => {
        toast.error(`Failed to disconnect: ${error.message}`);
      },
    }),
  );

  const handleConnect = () => {
    if (!readwiseToken.trim()) {
      toast.error("Please enter your Readwise API token");
      return;
    }
    connectMutation.mutate({ token: readwiseToken.trim() });
  };

  const handleDisconnect = () => {
    if (
      confirm(
        "Are you sure you want to disconnect Readwise? Your synced articles will remain.",
      )
    ) {
      disconnectMutation.mutate({ provider: "readwise" });
    }
  };

  const lastSyncAt = readwiseIntegration?.metadata?.lastSyncAt
    ? new Date(readwiseIntegration.metadata.lastSyncAt as string)
    : null;

  const totalSynced =
    (readwiseIntegration?.metadata?.totalItemsSynced as number) || 0;

  return (
    <main className="mx-auto w-full container space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-semibold font-serif">
              Readwise
            </h1>
            {readwiseIntegration && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} />
                Connected
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Sync documents from books, articles, and newsletters
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {readwiseIntegration ? (
            <>
              <ReadwiseSyncDialog>
                <Button>
                  <HugeiconsIcon icon={DatabaseSync01Icon} size={16} />
                  Sync Documents
                </Button>
              </ReadwiseSyncDialog>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowConnectDialog(true)}>
              Connect Readwise
            </Button>
          )}
        </div>
      </div>

      {readwiseIntegration && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Last Synced
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {lastSyncAt
                    ? lastSyncAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Never"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Synced
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {totalSynced} document{totalSynced !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium">How to add documents</h3>
            <p className="text-sm text-muted-foreground">
              Forward emails to your{" "}
              <a
                href="https://read.readwise.io/add-to-library"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                unique Readwise email
              </a>
              , then click "Sync Documents" to import them into your library.
            </p>
            <Link
              href="/dashboard?source=readwise"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <HugeiconsIcon icon={ViewIcon} size={14} />
              View synced documents
            </Link>
          </div>
        </div>
      )}

      {!readwiseIntegration && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h3 className="font-medium mb-2">Get Started with Readwise</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Readwise account to automatically sync documents from
            books, articles, and newsletters.
          </p>
          <Button onClick={() => setShowConnectDialog(true)}>
            Connect Readwise
          </Button>
        </div>
      )}

      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Readwise</DialogTitle>
            <DialogDescription>
              Enter your Readwise API token to sync your highlights
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">API Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="Enter your Readwise API token"
                value={readwiseToken}
                onChange={(e) => setReadwiseToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleConnect();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Get your token from{" "}
                <a
                  href="https://readwise.io/access_token"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  readwise.io/access_token
                </a>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConnectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              disabled={connectMutation.isPending || !readwiseToken.trim()}
            >
              {connectMutation.isPending ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  className="animate-spin"
                />
              ) : null}
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
