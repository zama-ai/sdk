"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useConfidentialBalance,
  useHasPermit,
  useMetadata,
  useShield,
  useWrappedToken,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import { useDeposit, usePaused, useRedeem } from "@zama-fhe/react-sdk/vaults";
import type { Address } from "@zama-fhe/sdk";
import { formatUnits, parseAbi, parseUnits } from "viem";
import { BatchList } from "@/components/vaults/BatchList";
import { describeError } from "@/lib/errors";
import { useNetwork } from "@/lib/hooks";
import type { BatchVault } from "@/lib/networks";
import { addOpenBatch } from "@/lib/openBatches";
import { minAmount, parseAmount } from "@/lib/parseAmount";

const COPY = {
  deposit: { title: "Deposit", unit: "assets", receive: "shares" },
  withdraw: { title: "Withdraw", unit: "shares", receive: "assets" },
} as const;

interface VaultActionCardProps {
  kind: keyof typeof COPY;
  vault: BatchVault;
  account: Address;
  permitContracts: Address[];
  /** The confidential token the action spends: the asset to deposit, the share to withdraw. */
  token: Address;
}

/** One direction of the vault: its balance, its form, and the batches it has in progress. */
export function VaultActionCard({
  kind,
  vault,
  account,
  permitContracts,
  token,
}: VaultActionCardProps) {
  const queryClient = useQueryClient();
  const { canMint } = useNetwork();
  const copy = COPY[kind];
  const batcher = kind === "deposit" ? vault.depositBatcher : vault.redeemBatcher;
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: metadata } = useMetadata(token);
  const { data: paused, error: pausedError } = usePaused({ address: batcher });
  // Uses the permit the position card grants: this card never prompts the wallet on its own.
  const { data: hasPermit } = useHasPermit({ contractAddresses: permitContracts });
  const balance = useConfidentialBalance(
    { address: token, account },
    { enabled: hasPermit === true },
  );

  // Store the returned batch id: the batch list shows it right away.
  const callbacks = {
    onSuccess: ({ batchId }: { batchId: bigint }) => {
      addOpenBatch(queryClient, batcher, account, batchId);
      setAmount("");
    },
  };
  const deposit = useDeposit({ addresses: vault }, callbacks);
  const redeem = useRedeem({ addresses: vault }, callbacks);
  const send = kind === "deposit" ? deposit : redeem;

  const parsed = metadata ? parseAmount(amount, metadata.decimals) : 0n;
  const reason =
    paused === undefined
      ? pausedError
        ? "Could not read whether the batcher is paused"
        : "Loading…"
      : paused
        ? `${copy.title}s are paused`
        : parsed === 0n
          ? "Enter an amount"
          : balance.data === undefined
            ? "Decrypt your balances first"
            : parsed > balance.data
              ? "Amount is above your balance"
              : null;

  const errors = [send.error, balance.error, pausedError].filter((error) => error !== null);

  return (
    <section className="card" aria-labelledby={`vault-${kind}-title`}>
      <h2 className="card-title" id={`vault-${kind}-title`}>
        {copy.title}
      </h2>
      <div className="balance-row">
        <div className="balance-label-group">
          <span className="balance-label">Available</span>
          {kind === "deposit" && canMint && metadata && (
            <MintAndShieldButton account={account} token={token} symbol={metadata.symbol} />
          )}
        </div>
        <output className="balance-value">
          {!hasPermit
            ? "—"
            : balance.data === undefined || !metadata
              ? "Decrypting…"
              : `${formatUnits(balance.data, metadata.decimals)} ${metadata.symbol}`}
        </output>
      </div>

      <form
        className="card-status"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason === null) {
            setSubmitted(false);
            send.mutate({ amount: parsed, onJoinSubmitted: () => setSubmitted(true) });
          }
        }}
      >
        <label className="sr-only" htmlFor={`vault-${kind}-amount`}>
          Amount to {kind}
        </label>
        <div className="input-row card-gap">
          <input
            id={`vault-${kind}-amount`}
            className="input"
            type="number"
            inputMode="decimal"
            min={metadata ? minAmount(metadata.decimals) : undefined}
            step="any"
            placeholder="0.00"
            value={amount}
            disabled={send.isPending}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span className="input-unit">{metadata?.symbol ?? copy.unit}</span>
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={send.isPending || reason !== null}
        >
          {send.isPending
            ? submitted
              ? "Waiting for the transaction…"
              : "Confirm in your wallet…"
            : (reason ?? copy.title)}
        </button>
      </form>

      {send.data && (
        <output className="alert alert-success card-status">
          Queued in batch #{send.data.batchId.toString()}. You receive your {copy.receive} once the
          batch is processed and you claim them below.
        </output>
      )}
      {errors.map((error) => (
        <div key={error.message} className="alert alert-error card-status" role="alert">
          {describeError(error, `${copy.title} failed`)}
        </div>
      ))}

      <BatchList batcher={batcher} account={account} fromBlock={vault.fromBlock} />
    </section>
  );
}

// Test tokens only: the ERC-20 behind the vault's asset lets anyone call mint.
const UNDERLYING_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function decimals() view returns (uint8)",
]);
const MINT_AMOUNT = "10";

/** Mints the test ERC-20 behind `token`, then shields it into `token`. */
function MintAndShieldButton({
  account,
  token,
  symbol,
}: {
  account: Address;
  token: Address;
  symbol: string;
}) {
  const sdk = useZamaSDK();
  const wrapped = useWrappedToken(token);
  const shield = useShield({ address: token });
  const mint = useMutation({
    mutationFn: async () => {
      const signer = sdk.signer;
      if (!signer) {
        throw new Error("Connect a wallet before minting tokens.");
      }
      const underlying = await wrapped.underlying();
      // Mint and shield both take the ERC-20's units, which can differ from the confidential token's.
      const decimals = await sdk.provider.readContract({
        address: underlying,
        abi: UNDERLYING_ABI,
        functionName: "decimals",
        args: [],
      });
      const amount = parseUnits(MINT_AMOUNT, decimals);
      const txHash = await signer.writeContract({
        address: underlying,
        abi: UNDERLYING_ABI,
        functionName: "mint",
        args: [account, amount],
      });
      await sdk.provider.waitForTransactionReceipt(txHash);
      await shield.mutateAsync({ amount });
    },
  });

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        disabled={mint.isPending}
        onClick={() => mint.mutate()}
      >
        {mint.isPending
          ? shield.isPending
            ? "Shielding…"
            : "Minting…"
          : `Mint ${MINT_AMOUNT} ${symbol}`}
      </button>
      {mint.error && (
        <span className="token-meta token-meta-error">
          {describeError(mint.error, "Mint failed")}
        </span>
      )}
    </>
  );
}
