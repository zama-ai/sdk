"use client";

import { useQuery } from "@tanstack/react-query";
import { useConfidentialBalance, useHasPermit, useMetadata } from "@zama-fhe/react-sdk";
import { useBatcherTokens, useVaultBatcher } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, parseAbi } from "viem";
import { publicClient, VAULT } from "@/lib/config";

const VALUE_ABI = parseAbi([
  // On each confidential wrapper: underlying units per confidential unit.
  "function rate() view returns (uint256)",
  // On the ERC-4626 vault.
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

/** The account's vault shares and what they are worth now in the vault's asset. */
export function Position({ account }: { account: Address }) {
  const { data: tokens } = useBatcherTokens({ address: VAULT.depositBatcher });
  if (!tokens) {
    return null;
  }
  return (
    <ShareBalance account={account} assetToken={tokens.fromToken} shareToken={tokens.toToken} />
  );
}

function ShareBalance({
  account,
  assetToken,
  shareToken,
}: {
  account: Address;
  assetToken: Address;
  shareToken: Address;
}) {
  const batcher = useVaultBatcher(VAULT.depositBatcher);
  const { data: assetMetadata } = useMetadata(assetToken);
  const { data: shareMetadata } = useMetadata(shareToken);
  // Uses the permit the form grants: this section never prompts the wallet on its own.
  const { data: hasPermit } = useHasPermit({ contractAddresses: [shareToken] });
  const shares = useConfidentialBalance(
    { address: shareToken, account },
    { enabled: hasPermit === true },
  );
  const { data: value } = useQuery({
    queryKey: ["position-value", shareToken, shares.data?.toString()],
    queryFn: async () => {
      const [vault, shareRate, assetRate] = await Promise.all([
        batcher.vault(),
        publicClient.readContract({ address: shareToken, abi: VALUE_ABI, functionName: "rate" }),
        publicClient.readContract({ address: assetToken, abi: VALUE_ABI, functionName: "rate" }),
      ]);
      const assets = await publicClient.readContract({
        address: vault,
        abi: VALUE_ABI,
        functionName: "convertToAssets",
        args: [shares.data! * shareRate],
      });
      return assets / assetRate;
    },
    enabled: shares.data !== undefined,
    // The share price moves as the vault earns: refresh it now and then.
    refetchInterval: 60_000,
  });

  return (
    <section>
      <h2>Your position</h2>
      {!hasPermit ? (
        <p>Decrypt your balance above to see it.</p>
      ) : shares.data === undefined || !shareMetadata || !assetMetadata ? (
        <p>
          {shares.error ? <span className="error">{shares.error.message}</span> : "Decrypting…"}
        </p>
      ) : (
        <p>
          {formatUnits(shares.data, shareMetadata.decimals)} {shareMetadata.symbol}
          {value !== undefined &&
            `, worth ${formatUnits(value, assetMetadata.decimals)} ${assetMetadata.symbol}`}
        </p>
      )}
    </section>
  );
}
