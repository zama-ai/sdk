"use client";

import { useMemo } from "react";
import { useConfidentialBalances, useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, getAddress, parseAbi } from "viem";
import { useReadContracts } from "wagmi";
import { describeError } from "@/lib/errors";
import type { BatchVault } from "@/lib/networks";
import type { VaultDetails } from "@/lib/vaults";

const ERC4626_ABI = parseAbi(["function convertToAssets(uint256 shares) view returns (uint256)"]);

interface PositionsOverviewProps {
  vaults: BatchVault[];
  /** From `useVaultDetails`, by vault index. */
  details: (VaultDetails | undefined)[];
  account: Address;
  /** Opens a vault in the picker below. */
  onSelect: (index: number) => void;
}

/** The shares the account holds in every vault, what they are worth, and a total per token. */
export function PositionsOverview({ vaults, details, account, onSelect }: PositionsOverviewProps) {
  const shareTokens = useMemo(
    () => [...new Set(details.flatMap((detail) => (detail ? [detail.share.address] : [])))],
    [details],
  );
  // One permit holds at most 10 contracts: with more share tokens, the wallet signs once per 10.
  const { data: hasPermit } = useHasPermit({ contractAddresses: shareTokens });
  const grantPermit = useGrantPermit();
  const balances = useConfidentialBalances(
    { addresses: shareTokens, account },
    { enabled: hasPermit === true },
  );

  const held = details.flatMap((detail, index) => {
    const shares = detail && balances.data?.results.get(getAddress(detail.share.address));
    return detail && shares ? [{ index, detail, shares }] : [];
  });
  // Each wrapper unit is `rate` underlying units: convert the shares to the vault's units, then
  // the assets back to the confidential asset's units.
  const { data: values, error: valueError } = useReadContracts({
    contracts: held.map(({ index, detail, shares }) => ({
      address: detail.erc4626,
      abi: ERC4626_ABI,
      functionName: "convertToAssets" as const,
      args: [shares * detail.share.rate] as const,
      chainId: vaults[index]?.chainId,
    })),
    // The share price moves as the vaults earn: refresh it now and then.
    query: { enabled: held.length > 0, refetchInterval: 60_000 },
  });

  const rows = held.map(({ index, detail, shares }, k) => {
    const assets = values?.[k]?.result;
    return {
      index,
      detail,
      shares,
      value: assets === undefined ? undefined : assets / detail.asset.rate,
    };
  });
  // Assets of different tokens do not add up: one total per asset token, once every value is
  // read. Keyed by address, as two tokens can share a symbol.
  const groups = new Map<
    Address,
    { symbol: string; decimals: number; total?: bigint; rows: typeof rows }
  >();
  for (const row of rows) {
    const { address, symbol, decimals } = row.detail.asset;
    const group = groups.get(address) ?? { symbol, decimals, total: 0n, rows: [] };
    group.rows.push(row);
    group.total =
      group.total === undefined || row.value === undefined ? undefined : group.total + row.value;
    groups.set(address, group);
  }
  const decryptError = grantPermit.error ?? balances.error;
  const failed = balances.data?.errors.size ?? 0;

  return (
    <section className="card" aria-labelledby="vault-positions-title">
      <h2 className="card-title" id="vault-positions-title">
        Your positions
      </h2>
      {!hasPermit ? (
        <div className="balance-row">
          <span className="balance-label">Shares in every vault</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={grantPermit.isPending || shareTokens.length === 0}
            onClick={() => grantPermit.mutate(shareTokens)}
          >
            {grantPermit.isPending ? "Sign in your wallet…" : "Decrypt balances"}
          </button>
        </div>
      ) : !balances.data ? (
        !balances.error && <p className="token-meta">Decrypting…</p>
      ) : groups.size === 0 ? (
        <p className="token-meta">No vault positions yet.</p>
      ) : (
        [...groups].map(([address, group]) => (
          <div key={address} className="card-status">
            <h3 className="section-label">{group.symbol}</h3>
            <ul className="batch-list">
              {group.rows.map(({ index, detail, shares, value }) => (
                <li key={index}>
                  <div>
                    <span className="balance-label">{detail.name}</span>
                    <p className="token-meta">
                      {formatUnits(shares, detail.share.decimals)} {detail.share.symbol}
                      {value !== undefined &&
                        ` ≈ ${formatUnits(value, detail.asset.decimals)} ${group.symbol}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => onSelect(index)}
                  >
                    Open
                  </button>
                </li>
              ))}
              {group.rows.length > 1 && group.total !== undefined && (
                <li>
                  <span className="balance-label">Total</span>
                  <output className="balance-value">
                    ≈ {formatUnits(group.total, group.decimals)} {group.symbol}
                  </output>
                </li>
              )}
            </ul>
          </div>
        ))
      )}
      {decryptError && (
        <div className="alert alert-error card-status" role="alert">
          {describeError(decryptError, "Decryption failed")}
        </div>
      )}
      {failed > 0 && (
        <p className="token-meta token-meta-error card-status">
          Could not decrypt {failed} of {shareTokens.length} share balances.
        </p>
      )}
      {valueError && (
        <div className="alert alert-error card-status" role="alert">
          {describeError(valueError, "Could not read what your shares are worth")}
        </div>
      )}
    </section>
  );
}
