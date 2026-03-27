"use client";

import { useWrapperDiscovery, type UseWrapperDiscoveryConfig } from "@zama-fhe/react-sdk";

export function WrapperDiscoveryPanel({ tokenAddress, erc20Address }: UseWrapperDiscoveryConfig) {
  const wrapperDiscovery = useWrapperDiscovery({
    tokenAddress,
    erc20Address,
  });

  return (
    <section className="space-y-2">
      {wrapperDiscovery.data !== undefined && (
        <p data-testid="wrapper-discovery-result">Wrapper: {wrapperDiscovery.data ?? "none"}</p>
      )}
      {wrapperDiscovery.isError && (
        <p className="text-zama-error" data-testid="wrapper-discovery-error">
          Error: {wrapperDiscovery.error.message}
        </p>
      )}
    </section>
  );
}
