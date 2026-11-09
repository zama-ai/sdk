"use client";

import { useQuery } from "@tanstack/react-query";
import {
  useConfidentialBalance,
  useGrantPermit,
  useHasPermit,
  useMetadata,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import { useBatcherTokens, useVaultBatcher } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, parseAbi } from "viem";
import { VaultActionCard } from "@/components/vaults/VaultActionCard";
import { describeError } from "@/lib/errors";
import { useNetwork } from "@/lib/hooks";
import type { BatchVault } from "@/lib/networks";

const VALUE_ABI = parseAbi([
  // On each confidential wrapper: underlying units per confidential unit.
  "function rate() view returns (uint256)",
  // On the ERC-4626 vault.
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

export function VaultsTab({ account }: { account: Address }) {
  const { batchVault } = useNetwork();
  if (!batchVault) {
    return (
      <section className="card">
        <h2 className="card-title">Vaults</h2>
        <p className="token-meta">
          No vault is configured for this network. Set NEXT_PUBLIC_VAULT_DEPOSIT_BATCHER and
          NEXT_PUBLIC_VAULT_REDEEM_BATCHER (see .env.example), then restart the app.
        </p>
      </section>
    );
  }
  return <VaultPanel vault={batchVault} account={account} />;
}

function VaultPanel({ vault, account }: { vault: BatchVault; account: Address }) {
  // The deposit batcher takes the vault's asset and pays out its shares.
  const { data: tokens, error } = useBatcherTokens({ address: vault.depositBatcher });
  if (!tokens) {
    return (
      <section className="card">
        {error ? (
          <div className="alert alert-error" role="alert">
            {describeError(error, "Could not read the vault's tokens")}
          </div>
        ) : (
          <p className="token-meta">Loading the vault…</p>
        )}
      </section>
    );
  }

  // One permit covers both tokens and both batchers (for the amounts in the batch lists),
  // so the first decrypt is the only signature the tab asks for.
  const permitContracts = [
    tokens.fromToken,
    tokens.toToken,
    vault.depositBatcher,
    vault.redeemBatcher,
  ];
  const props = { vault, account, permitContracts };
  return (
    <>
      <PositionCard {...props} assetToken={tokens.fromToken} shareToken={tokens.toToken} />
      {/* A deposit sends assets and is claimed as shares; a withdrawal sends shares and is
          claimed as assets. */}
      <VaultActionCard {...props} kind="deposit" token={tokens.fromToken} />
      <VaultActionCard {...props} kind="withdraw" token={tokens.toToken} />
    </>
  );
}

interface PositionCardProps {
  vault: BatchVault;
  account: Address;
  permitContracts: Address[];
  assetToken: Address;
  shareToken: Address;
}

/** The account's vault shares and what they are worth now in the vault's asset. */
function PositionCard({
  vault,
  account,
  permitContracts,
  assetToken,
  shareToken,
}: PositionCardProps) {
  const sdk = useZamaSDK();
  const batcher = useVaultBatcher(vault.depositBatcher);
  const { data: assetMetadata } = useMetadata(assetToken);
  const { data: shareMetadata } = useMetadata(shareToken);
  // The first decryption asks the wallet for a signature, so it starts from a click.
  const { data: hasPermit } = useHasPermit({ contractAddresses: permitContracts });
  const grantPermit = useGrantPermit();
  const shares = useConfidentialBalance(
    { address: shareToken, account },
    { enabled: hasPermit === true },
  );
  const { data: value } = useQuery({
    queryKey: ["vault-position-value", shareToken, shares.data?.toString()],
    queryFn: async () => {
      const [vaultAddress, shareRate, assetRate] = await Promise.all([
        batcher.vault(),
        sdk.provider.readContract({
          address: shareToken,
          abi: VALUE_ABI,
          functionName: "rate",
          args: [],
        }),
        sdk.provider.readContract({
          address: assetToken,
          abi: VALUE_ABI,
          functionName: "rate",
          args: [],
        }),
      ]);
      const assets = await sdk.provider.readContract({
        address: vaultAddress,
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
    <section className="card" aria-labelledby="vault-position-title">
      <h2 className="card-title" id="vault-position-title">
        Your position
      </h2>
      <div className="balance-row">
        <span className="balance-label">Shares</span>
        {!hasPermit ? (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={grantPermit.isPending}
            onClick={() => grantPermit.mutate(permitContracts)}
          >
            {grantPermit.isPending ? "Sign in your wallet…" : "Decrypt balances"}
          </button>
        ) : (
          <output className="balance-value">
            {shares.data === undefined || !shareMetadata
              ? "Decrypting…"
              : `${formatUnits(shares.data, shareMetadata.decimals)} ${shareMetadata.symbol}`}
          </output>
        )}
      </div>
      {value !== undefined && assetMetadata && (
        <div className="balance-row">
          <span className="balance-label">Worth now</span>
          <output className="balance-value">
            {formatUnits(value, assetMetadata.decimals)} {assetMetadata.symbol}
          </output>
        </div>
      )}
      {(grantPermit.error ?? shares.error) && (
        <div className="alert alert-error card-status" role="alert">
          {describeError(grantPermit.error ?? shares.error, "Decryption failed")}
        </div>
      )}
    </section>
  );
}
