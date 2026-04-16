"use client";

import { useIsConfidential, useIsWrapper, useMetadata } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function TokenMetadataPanel({ tokenAddress }: { tokenAddress: Address }) {
  const { data: metadata, isLoading: metaLoading } = useMetadata(tokenAddress);
  const { data: isConfidential, isLoading: confLoading } = useIsConfidential(tokenAddress);
  const { data: isWrapper, isLoading: wrapperLoading } = useIsWrapper(tokenAddress);

  const loading = metaLoading || confLoading || wrapperLoading;

  return (
    <div className="space-y-4" data-testid="token-metadata-panel">
      <h2 className="text-xl font-semibold text-white">Token Metadata</h2>

      {loading ? (
        <p className="text-zama-gray" data-testid="metadata-loading">
          Loading...
        </p>
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-zama-gray">Name:</dt>
            <dd className="text-white" data-testid="metadata-name">
              {metadata?.name ?? "N/A"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zama-gray">Symbol:</dt>
            <dd className="text-white" data-testid="metadata-symbol">
              {metadata?.symbol ?? "N/A"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zama-gray">Decimals:</dt>
            <dd className="text-white" data-testid="metadata-decimals">
              {metadata?.decimals?.toString() ?? "N/A"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zama-gray">Is Confidential:</dt>
            <dd className="text-white" data-testid="metadata-is-confidential">
              {isConfidential === undefined ? "N/A" : String(isConfidential)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zama-gray">Is Wrapper:</dt>
            <dd className="text-white" data-testid="metadata-is-wrapper">
              {isWrapper === undefined ? "N/A" : String(isWrapper)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
