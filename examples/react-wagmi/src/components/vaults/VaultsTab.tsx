"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useConfidentialBalance,
  useGrantPermit,
  useHasPermit,
  useMetadata,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, parseAbi } from "viem";
import { useReadContracts } from "wagmi";
import { VaultActionCard } from "@/components/vaults/VaultActionCard";
import { describeError } from "@/lib/errors";
import { useNetwork } from "@/lib/hooks";
import type { BatchVault } from "@/lib/networks";
import { vaultGroup } from "@/lib/vaults";

// The vault group names the asset and the share token. This app reads both from the deposit
// batcher, so only the two batchers need to be set.
const BATCHER_ABI = parseAbi([
  "function fromToken() view returns (address)",
  "function toToken() view returns (address)",
  "function vault() view returns (address)",
]);

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
  const { data, error } = useReadContracts({
    contracts: (["fromToken", "toToken", "vault"] as const).map((functionName) => ({
      address: vault.depositBatcher,
      abi: BATCHER_ABI,
      functionName,
      chainId: vault.chainId,
    })),
    allowFailure: false,
  });
  const [assetToken, shareToken, erc4626] = data ?? [];
  // Built once per vault, so the read hooks see the same group on every render.
  const group = useMemo(
    () => (assetToken && shareToken ? vaultGroup(vault, assetToken, shareToken) : undefined),
    [vault, assetToken, shareToken],
  );
  if (!group || !assetToken || !shareToken || !erc4626) {
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

  // One permit covers both tokens and both batchers (for the amounts in the positions),
  // so the first decrypt is the only signature the tab asks for.
  const permitContracts = [assetToken, shareToken, vault.depositBatcher, vault.redeemBatcher];
  const props = { vault: group, account, permitContracts };
  return (
    <>
      <PositionCard
        account={account}
        permitContracts={permitContracts}
        vault={erc4626}
        assetToken={assetToken}
        shareToken={shareToken}
      />
      {/* A deposit sends assets and is paid out in shares; a withdrawal sends shares and is
          paid out in assets. */}
      <VaultActionCard {...props} kind="deposit" token={assetToken} />
      <VaultActionCard {...props} kind="withdraw" token={shareToken} />
    </>
  );
}

interface PositionCardProps {
  account: Address;
  permitContracts: Address[];
  /** The ERC-4626 vault. */
  vault: Address;
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
  const { data: assetMetadata } = useMetadata(assetToken);
  const { data: shareMetadata } = useMetadata(shareToken);
  // The first decryption asks the wallet for a signature, so it starts from a click.
  const { data: hasPermit } = useHasPermit({ contractAddresses: permitContracts });
  const grantPermit = useGrantPermit();
  const shares = useConfidentialBalance(
    { address: shareToken, account },
    { enabled: hasPermit === true },
  );
  const { data: value, error: valueError } = useQuery({
    queryKey: ["vault-position-value", shareToken, shares.data?.toString()],
    queryFn: async () => {
      const [shareRate, assetRate] = await Promise.all([
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
      {valueError && (
        <div className="alert alert-error card-status" role="alert">
          {describeError(valueError, "Could not read what your shares are worth")}
        </div>
      )}
    </section>
  );
}
