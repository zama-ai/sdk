"use client";

import { Suspense, useEffect, useState } from "react";
import {
  useConfidentialIsOperatorSuspense,
  useIsConfidentialSuspense,
  useIsWrapperSuspense,
  useMetadataSuspense,
  useTotalSupplySuspense,
  useUnderlyingAllowanceSuspense,
  useWrapperDiscoverySuspense,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { useAccount } from "wagmi";

/** Exercises every Suspense query variant behind a single Suspense boundary. */
export function SuspensePanel({
  tokenAddress,
  erc20Address,
}: {
  tokenAddress: Address;
  erc20Address: Address;
}) {
  // Suspense queries fetch during render — hold them back until the client has
  // mounted (Next.js pre-render has no wallet) and the burner wallet connected.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address } = useAccount();

  if (!mounted || !address) {
    return (
      <p className="text-zama-gray" data-testid="suspense-waiting">
        Waiting for wallet...
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="suspense-panel">
      <h2 className="text-xl font-semibold text-white">Suspense Queries</h2>
      <Suspense
        fallback={
          <p className="text-zama-gray" data-testid="suspense-loading">
            Loading...
          </p>
        }
      >
        <SuspenseSections
          tokenAddress={tokenAddress}
          erc20Address={erc20Address}
          account={address}
        />
      </Suspense>
    </div>
  );
}

function SuspenseSections({
  tokenAddress,
  erc20Address,
  account,
}: {
  tokenAddress: Address;
  erc20Address: Address;
  account: Address;
}) {
  const metadata = useMetadataSuspense(tokenAddress);
  const totalSupply = useTotalSupplySuspense(tokenAddress);
  const isConfidential = useIsConfidentialSuspense(tokenAddress);
  const isWrapper = useIsWrapperSuspense(tokenAddress);
  const isOperator = useConfidentialIsOperatorSuspense({
    address: tokenAddress,
    holder: account,
    spender: account,
  });
  const allowance = useUnderlyingAllowanceSuspense({ address: tokenAddress, owner: account });
  const discoveredWrapper = useWrapperDiscoverySuspense({ tokenAddress, erc20Address });

  return (
    <dl className="space-y-2 text-sm">
      <div className="flex gap-2">
        <dt className="text-zama-gray">Symbol:</dt>
        <dd className="text-white" data-testid="suspense-symbol">
          {metadata.data.symbol}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-zama-gray">Total Supply:</dt>
        <dd className="text-white" data-testid="suspense-total-supply">
          {totalSupply.data.toString()}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-zama-gray">Is Confidential:</dt>
        <dd className="text-white" data-testid="suspense-is-confidential">
          {String(isConfidential.data)}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-zama-gray">Is Wrapper:</dt>
        <dd className="text-white" data-testid="suspense-is-wrapper">
          {String(isWrapper.data)}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-zama-gray">Is Self Operator:</dt>
        <dd className="text-white" data-testid="suspense-is-operator">
          {String(isOperator.data)}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-zama-gray">Underlying Allowance:</dt>
        <dd className="text-white" data-testid="suspense-allowance">
          {allowance.data.toString()}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-zama-gray">Discovered Wrapper:</dt>
        <dd className="text-white" data-testid="suspense-wrapper-discovery">
          {discoveredWrapper.data ?? "none"}
        </dd>
      </div>
    </dl>
  );
}
