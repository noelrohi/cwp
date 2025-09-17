"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import {
  TRPCProvider,
  getQueryClient,
  createTRPCClientInstance,
} from "@/lib/trpc/client";

interface TRPCProvidersProps {
  children: React.ReactNode;
}

export function TRPCProviders({ children }: TRPCProvidersProps) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() => createTRPCClientInstance());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
