import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import type { ZamaConfig } from "@zama-fhe/sdk";
import { ZamaProvider } from "../provider";

export function Providers({
  children,
  queryClient,
  config,
}: PropsWithChildren<{ queryClient: QueryClient; config: ZamaConfig }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={config}>{children}</ZamaProvider>
    </QueryClientProvider>
  );
}
