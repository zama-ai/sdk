"use client";

import { SEPOLIA_EXPLORER_URL } from "@/lib/config";
import { useMintUnderlying, useUnderlyingBalance } from "@/lib/hooks";
import { useConfidentialBalance, useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { formatUnits } from "viem";

interface BalancesCardProps {
  token: TokenWrapperPairWithMetadata;
  account: Address;
  // Every confidential token to grant a decryption permit for in a single signature,
  // so switching tokens later does not require re-signing.
  validPairs: TokenWrapperPairWithMetadata[];
  disabled: boolean;
  // Called after a successful mint so the parent can refresh the balances it owns
  // (e.g. the native ETH balance shown in the header).
  onSuccess?: () => void;
}

export function BalancesCard({
  token,
  account,
  validPairs,
  disabled,
  onSuccess,
}: BalancesCardProps) {
  const { data: isAllowed } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });

  const { data: erc20Balance } = useUnderlyingBalance(token, account, { enabled: !disabled });

  const balance = useConfidentialBalance(
    { address: token.confidentialTokenAddress, account },
    { enabled: !disabled && !!isAllowed },
  );

  const grantPermit = useGrantPermit();
  const mint = useMintUnderlying(token, account, { onSuccess });

  const formattedErc20 =
    erc20Balance !== undefined
      ? `${formatUnits(erc20Balance, token.underlying.decimals)} ${token.underlying.symbol}`
      : "—";
  const formattedConfidential =
    balance.data !== undefined
      ? `${formatUnits(balance.data, token.confidential.decimals)} ${token.confidential.symbol}`
      : "—";
  const isLoadingConfidential = balance.isLoading || balance.isFetching;

  const mintError = mint.isError ? (mint.error?.message ?? null) : null;
  const decryptError = grantPermit.isError
    ? (grantPermit.error?.message ?? "Signing failed")
    : null;

  return (
    <section className="card" aria-labelledby="balances-title">
      <h2 className="card-title" id="balances-title">
        Balances
      </h2>
      <div className="balance-row">
        <div className="balance-label-group">
          <span className="balance-label">ERC-20 (public)</span>
          <form action={() => mint.mutate()}>
            <button
              type="submit"
              className="btn btn-sm btn-secondary"
              disabled={disabled || mint.isPending}
            >
              {mint.isPending ? "Minting…" : `Mint ${token.underlying.symbol}`}
            </button>
          </form>
        </div>
        <output className="balance-value">{formattedErc20}</output>
      </div>
      <div className="balance-row">
        <span className="balance-label">Confidential (private)</span>
        {!isAllowed ? (
          <form
            action={() =>
              grantPermit.mutate(validPairs.map((pair) => pair.confidentialTokenAddress))
            }
          >
            <button
              type="submit"
              className="btn btn-sm btn-secondary"
              disabled={grantPermit.isPending}
            >
              {grantPermit.isPending ? "Signing…" : "Decrypt Balance"}
            </button>
          </form>
        ) : (
          <output className={`balance-value${isLoadingConfidential ? " loading" : ""}`}>
            {isLoadingConfidential ? <i>Decrypting…</i> : formattedConfidential}
          </output>
        )}
      </div>
      {decryptError && (
        <div className="alert alert-error card-status" role="alert">
          {decryptError}
        </div>
      )}
      {mintError && (
        <div className="alert alert-error card-status" role="alert">
          {mintError}
        </div>
      )}
      {mint.isSuccess && mint.data && (
        <output className="alert alert-success card-status">
          Minted!{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${mint.data}`} target="_blank" rel="noreferrer">
            {mint.data.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
