"use client";

import { useWrapperDiscovery, type Address } from "@zama-fhe/token-react-sdk";

export function WrapperDiscoveryPanel({
  tokenAddress,
  coordinatorAddress,
}: {
  tokenAddress: Address;
  coordinatorAddress?: Address;
}) {
  const wrapperDiscovery = useWrapperDiscovery(tokenAddress, coordinatorAddress);

  return (
    <section className="space-y-2">
      {wrapperDiscovery.data !== undefined && (
        <p data-testid="wrapper-discovery-result">Wrapper: {wrapperDiscovery.data ?? "none"}</p>
      )}
      {wrapperDiscovery.isError && (
        <p className="text-red-600" data-testid="wrapper-discovery-error">
          Error: {wrapperDiscovery.error.message}
        </p>
      )}
    </section>
  );
}
