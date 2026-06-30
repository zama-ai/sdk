"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useReadContract } from "wagmi";
import { useMutation } from "@tanstack/react-query";
import { useDecryptValues, useGrantPermit, useHasPermit, useZamaSDK } from "@zama-fhe/react-sdk";
import type { Address, EncryptedValue } from "@zama-fhe/sdk";
import { isEncryptedValueZero } from "@zama-fhe/sdk";
import { VAULT_ABI } from "@/lib/vaultAbi";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface VaultPositionCardProps {
  vaultAddress: Address;
  connectedAddress: Address;
  decimals: number;
  symbol: string;
  onWithdraw?: () => void;
}

export function VaultPositionCard({
  vaultAddress,
  connectedAddress,
  decimals,
  symbol,
  onWithdraw,
}: VaultPositionCardProps) {
  const sdk = useZamaSDK();
  const [revealed, setRevealed] = useState(false);

  // The vault holds an euint64 share per beneficiary; reading returns its handle.
  const { data: shareHandle, refetch: refetchShares } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "sharesOf",
    args: [connectedAddress],
  });

  const handle = shareHandle as EncryptedValue | undefined;
  const hasPosition = handle !== undefined && !isEncryptedValueZero(handle);

  // Decrypting a vault handle needs a permit scoped to the vault address — distinct from
  // the confidential-token permits the main page grants. The vault's `FHE.allow(..., beneficiary)`
  // is what authorizes this wallet to decrypt its own position.
  const { data: hasVaultPermit } = useHasPermit({ contractAddresses: [vaultAddress] });
  const grantPermit = useGrantPermit();

  const decrypt = useDecryptValues(
    hasPosition ? [{ encryptedValue: handle, contractAddress: vaultAddress }] : [],
    { enabled: revealed && hasPosition },
  );

  function handleReveal() {
    if (hasVaultPermit) {
      setRevealed(true);
      return;
    }
    grantPermit.mutate([vaultAddress], { onSuccess: () => setRevealed(true) });
  }

  const withdraw = useMutation({
    mutationFn: async () => {
      const signer = sdk.signer;
      if (!signer) throw new Error("Connect a wallet before withdrawing.");
      const txHash = await signer.writeContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "withdraw",
        args: [],
      });
      await sdk.provider.waitForTransactionReceipt(txHash);
      return txHash;
    },
    onSuccess: () => {
      setRevealed(false);
      void refetchShares();
      onWithdraw?.();
    },
  });

  const clearShares = handle && decrypt.data ? decrypt.data[handle] : undefined;
  const formattedShares =
    clearShares !== undefined ? `${formatUnits(BigInt(clearShares), decimals)} ${symbol}` : "—";

  return (
    <div className="card">
      <div className="card-title">Your Vault Position</div>

      {!hasPosition ? (
        <p className="token-meta" data-testid="vault-no-position">
          No vault position yet — deposit above to credit a beneficiary.
        </p>
      ) : (
        <>
          <div className="input-row card-gap">
            <span className="input-unit" data-testid="vault-position-amount">
              {revealed ? formattedShares : "•••••"}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-full card-gap"
            onClick={handleReveal}
            disabled={grantPermit.isPending || decrypt.isFetching || revealed}
            data-testid="vault-reveal-button"
          >
            {grantPermit.isPending
              ? "Signing…"
              : decrypt.isFetching
                ? "Decrypting…"
                : revealed
                  ? "Revealed"
                  : "Reveal position"}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => withdraw.mutate()}
            disabled={withdraw.isPending}
            data-testid="vault-withdraw-button"
          >
            {withdraw.isPending ? "Withdrawing…" : "Withdraw all"}
          </button>
        </>
      )}

      {grantPermit.isError && (
        <div className="alert alert-error card-status">
          {grantPermit.error?.message ?? "Signing failed"}
        </div>
      )}
      {decrypt.isError && (
        <div className="alert alert-error card-status">{decrypt.error?.message}</div>
      )}
      {withdraw.isError && (
        <div className="alert alert-error card-status">{withdraw.error?.message}</div>
      )}
      {withdraw.isSuccess && withdraw.data && (
        <div className="alert alert-success card-status">
          Withdrawn!{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${withdraw.data}`} target="_blank" rel="noreferrer">
            {withdraw.data.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
