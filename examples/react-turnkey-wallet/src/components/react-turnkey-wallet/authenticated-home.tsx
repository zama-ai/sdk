"use client";

import { useState, useCallback, useMemo } from "react";
import { useZamaSDK, allowanceContract, approveContract } from "@zama-fhe/react-sdk";
import type { Address, Hex } from "viem";
import { BalancesCard } from "./balances-card";
import { ResumeUnshieldCard, UnshieldCard } from "./unshield-card";
import { ShieldCard } from "./shield-card";
import { TokenSelectorCard } from "./token-selector-card";
import { TransferCard } from "./transfer-card";
import { WalletHeader } from "./wallet-header";
import { useTurnkeyZama } from "@/components/providers";
import { explorerUrl, isTestnet, viemChain } from "@/lib/config";
import { MINT_ABI, ZERO_ADDRESS, shortAddr } from "@/lib/react-turnkey-wallet/utils";
import { useEthBalance } from "@/hooks/react-turnkey-wallet/use-eth-balance";
import { usePendingUnshield } from "@/hooks/react-turnkey-wallet/use-pending-unshield";
import { usePublicTokenBalance } from "@/hooks/react-turnkey-wallet/use-public-token-balance";
import { useTokenPairs } from "@/hooks/react-turnkey-wallet/use-token-pairs";

export function AuthenticatedHome({ walletAddress }: { walletAddress: Address }) {
  const sdk = useZamaSDK();
  const { publicClient, waitForTransactionReceipt } = useTurnkeyZama();

  const [selectedTokenAddressState, setSelectedTokenAddress] = useState<Address | null>(null);
  const [isBalanceRequested, setIsBalanceRequested] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const { isRegistryPending, validPairs, selectedTokenAddress, selectedPair } =
    useTokenPairs(selectedTokenAddressState);
  const { data: ethBalance } = useEthBalance(publicClient, walletAddress);
  const { publicBalance, refetchPublicBalance } = usePublicTokenBalance(
    selectedPair,
    walletAddress,
  );
  const { pendingUnshieldHash, setPendingUnshieldHash, clearStoredPendingUnshield } =
    usePendingUnshield(selectedPair);

  const tokenAddress = selectedPair?.confidentialTokenAddress ?? ZERO_ADDRESS;

  const walletAddressLabel = useMemo(
    () => (
      <a
        href={`${explorerUrl}/address/${walletAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-blue-600 hover:underline"
      >
        {shortAddr(walletAddress)}
      </a>
    ),
    [walletAddress],
  );

  const preApproveShield = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!selectedPair) return;
      const owner = walletAddress;
      const underlying = selectedPair.tokenAddress;
      const wrapper = selectedPair.confidentialTokenAddress;

      const allowance = (await sdk.signer.readContract(
        allowanceContract(underlying, owner, wrapper),
      )) as bigint;

      if (allowance >= amount) return;

      if (allowance > 0n) {
        const resetHash = await sdk.signer.writeContract(approveContract(underlying, wrapper, 0n));
        await waitForTransactionReceipt(resetHash as Hex);
      }

      const approveHash = await sdk.signer.writeContract(
        approveContract(underlying, wrapper, amount),
      );
      await waitForTransactionReceipt(approveHash as Hex);
    },
    [sdk, selectedPair, waitForTransactionReceipt, walletAddress],
  );

  const handleMint = useCallback(async () => {
    if (!selectedPair) return;
    setIsMinting(true);
    setMintError(null);
    try {
      const amount = 10n * 10n ** BigInt(selectedPair.underlying.decimals);
      const hash = await sdk.signer.writeContract({
        address: selectedPair.tokenAddress,
        abi: MINT_ABI,
        functionName: "mint",
        args: [walletAddress, amount],
      });
      await waitForTransactionReceipt(hash as Hex);
      await refetchPublicBalance();
    } catch (error: unknown) {
      setMintError(error instanceof Error ? error.message : "Mint failed");
    } finally {
      setIsMinting(false);
    }
  }, [sdk, selectedPair, refetchPublicBalance, waitForTransactionReceipt, walletAddress]);

  const handleUnshieldSuccess = useCallback(() => {
    void clearStoredPendingUnshield();
    void refetchPublicBalance();
  }, [clearStoredPendingUnshield, refetchPublicBalance]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 space-y-4 font-sans">
      <WalletHeader
        walletAddressLabel={walletAddressLabel}
        networkName={viemChain.name}
        ethBalance={ethBalance}
      />

      <TokenSelectorCard
        isRegistryPending={isRegistryPending}
        selectedTokenAddress={selectedTokenAddress}
        validPairs={validPairs}
        onSelect={(address) => {
          setSelectedTokenAddress(address);
          setIsBalanceRequested(false);
          setPendingUnshieldHash(null);
        }}
      />

      {selectedPair && (
        <>
          <BalancesCard
            publicBalance={publicBalance ?? null}
            tokenAddress={tokenAddress}
            isBalanceRequested={isBalanceRequested}
            onReveal={() => setIsBalanceRequested(true)}
            isTestnet={isTestnet}
            isMinting={isMinting}
            mintError={mintError}
            onMint={handleMint}
            selectedPair={selectedPair}
          />

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Operations
            </span>
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          </div>

          {pendingUnshieldHash && (
            <ResumeUnshieldCard
              tokenAddress={tokenAddress}
              txHash={pendingUnshieldHash}
              onSuccess={handleUnshieldSuccess}
            />
          )}

          <ShieldCard
            tokenAddress={tokenAddress}
            decimals={selectedPair.underlying.decimals}
            symbol={selectedPair.underlying.symbol}
            onSuccess={() => {
              void refetchPublicBalance();
            }}
            preApprove={preApproveShield}
          />

          <TransferCard
            tokenAddress={tokenAddress}
            decimals={selectedPair.confidential.decimals}
            symbol={selectedPair.confidential.symbol}
          />

          <UnshieldCard
            tokenAddress={tokenAddress}
            decimals={selectedPair.confidential.decimals}
            symbol={selectedPair.confidential.symbol}
            onSuccess={handleUnshieldSuccess}
          />
        </>
      )}

      {!isRegistryPending && validPairs.length === 0 && (
        <div className="card">
          <p className="text-sm text-zinc-500">
            No supported confidential token pairs were found for this network.
          </p>
        </div>
      )}
    </div>
  );
}
