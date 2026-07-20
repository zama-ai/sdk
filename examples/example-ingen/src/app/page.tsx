"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, formatEther, formatUnits, http, parseAbi, parseUnits } from "viem";
import { useConnection, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import {
  useConfidentialBalance,
  useHasPermit,
  useGrantPermit,
  useListPairs,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import { balanceOfContract } from "@zama-fhe/sdk";
import type { TokenWrapperPairWithMetadata, Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { ActionScreen, AppHeader, TokenSelector } from "@/components/PageChrome";
import { ingen, INGEN_CHAIN_ID, INGEN_RPC_URL } from "@/lib/config";

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

// Routes native TREX balance reads through the direct InGen RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcClient = createPublicClient({ chain: ingen, transport: http(INGEN_RPC_URL) });

interface SelectedTokenPanelProps {
  address: Address;
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
  isIngen: boolean;
  ethBalanceKey: readonly unknown[];
}

function SelectedTokenPanel({
  address,
  token,
  validPairs,
  isIngen,
  ethBalanceKey,
}: SelectedTokenPanelProps) {
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

  const { data: isAllowed } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });

  const decimals = token.confidential.decimals;
  const erc20Decimals = token.underlying.decimals;
  const confidentialSymbol = token.confidential.symbol;
  const erc20Symbol = token.underlying.symbol;

  const allowTokens = useGrantPermit();
  function handleDecrypt() {
    if (validPairs.length === 0) return;
    allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
  }

  const erc20BalanceKey = ["erc20-balance", token.tokenAddress, address] as const;
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () => {
      const result = await sdk.provider.readContract(
        balanceOfContract(token.tokenAddress, address),
      );
      return result as bigint;
    },
    enabled: isIngen,
  });

  const refreshBalances = () => {
    queryClient.invalidateQueries({ queryKey: erc20BalanceKey });
    queryClient.invalidateQueries({ queryKey: ethBalanceKey });
    queryClient.invalidateQueries({
      queryKey: zamaQueryKeys.confidentialBalance.token(token.confidentialTokenAddress),
    });
  };

  const balance = useConfidentialBalance(
    { address: token.confidentialTokenAddress, account: address },
    { enabled: isIngen && !!isAllowed },
  );

  const mint = useMutation({
    mutationFn: async () => {
      const signer = sdk.signer;
      if (!signer) {
        throw new Error("Connect a wallet before minting tokens.");
      }
      const txHash = await signer.writeContract({
        address: token.tokenAddress,
        abi: MINT_ABI,
        functionName: "mint",
        args: [address, parseUnits("10", erc20Decimals)],
      });
      await sdk.provider.waitForTransactionReceipt(txHash);
      return txHash;
    },
    onSuccess: refreshBalances,
  });

  useEffect(() => {
    mint.reset();
    allowTokens.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, token.confidentialTokenAddress]);

  const formattedErc20 =
    erc20Balance !== undefined ? `${formatUnits(erc20Balance, erc20Decimals)} ${erc20Symbol}` : "—";
  const formattedConfidential =
    balance.data !== undefined
      ? `${formatUnits(balance.data, decimals)} ${confidentialSymbol}`
      : "—";
  const actionsDisabled = !isIngen;

  return (
    <>
      <BalancesCard
        formattedErc20={formattedErc20}
        formattedConfidential={formattedConfidential}
        isLoadingConfidential={balance.isLoading || balance.isFetching}
        erc20Symbol={erc20Symbol}
        onMint={() => mint.mutate()}
        isMinting={mint.isPending}
        mintDisabled={actionsDisabled}
        mintError={mint.isError ? (mint.error?.message ?? null) : null}
        mintTxHash={mint.isSuccess && mint.data ? mint.data : null}
        isAllowed={!!isAllowed}
        onDecrypt={handleDecrypt}
        isDecrypting={allowTokens.isPending}
        decryptError={allowTokens.isError ? (allowTokens.error?.message ?? "Signing failed") : null}
      />

      {validPairs.map((pair) => (
        <PendingUnshieldCard
          key={`${pair.confidentialTokenAddress}-${address}`}
          tokenAddress={pair.confidentialTokenAddress}
          label={pair.underlying.symbol}
          onSuccess={refreshBalances}
        />
      ))}

      <h2 className="section-label">Operations</h2>

      <ShieldCard
        key={`shield-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={erc20Decimals}
        symbol={erc20Symbol}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <TransferCard
        key={`transfer-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshBalances}
      />

      <UnshieldCard
        key={`unshield-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshBalances}
      />

      <h2 className="section-label">Delegation — as owner</h2>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        disabled={actionsDisabled}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        disabled={actionsDisabled}
      />

      <h2 className="section-label">Delegation — as delegate</h2>

      <DecryptAsCard
        key={`decrypt-as-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        connectedAddress={address}
      />
    </>
  );
}

export default function Home() {
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isIngen = chainId === INGEN_CHAIN_ID;

  // Registry address is resolved automatically from the connected chain via the
  // chain config we passed to createConfig (registryAddress: 0xc0E8B73b…).
  const {
    data: pairsData,
    isPending: isRegistryPending,
    isError: isRegistryError,
  } = useListPairs({ metadata: true });

  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (pair): pair is TokenWrapperPairWithMetadata => pair.isValid && "underlying" in pair,
      ),
    [pairsData],
  );

  useEffect(() => {
    if (validPairs.length > 0 && selectedTokenAddress === null) {
      setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
    }
  }, [validPairs, selectedTokenAddress]);

  const token = validPairs.find((p) => p.confidentialTokenAddress === selectedTokenAddress);

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    queryFn: () => rpcClient.getBalance({ address: address as Address }).then(formatEther),
    enabled: !!address && isIngen,
  });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected || !address) {
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <ActionScreen
        title="InGen Confidential Token Quickstart"
        description="Connect your wallet to interact with ERC-7984 tokens on the InGen testnet."
        actionLabel="Connect Wallet"
        pendingLabel="Connecting…"
        pending={isConnecting}
        onAction={() => connect({ connector: injected() })}
        error={
          isNoWallet
            ? "No Ethereum wallet found. Please install an EIP-1193 browser wallet."
            : connectError?.message
        }
      />
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isIngen) {
    return (
      <ActionScreen
        title="InGen Network Required"
        description={`This app only works on the InGen testnet (chain ID ${INGEN_CHAIN_ID}).`}
        actionLabel="Switch to InGen"
        pendingLabel="Switching…"
        pending={isSwitching}
        onAction={() => switchChain({ chainId: ingen.id })}
        error={switchError && "Could not switch to InGen. Please switch manually in your wallet."}
      />
    );
  }

  // ── Screen 3: Connected on InGen — main UI ─────────────────────────────────
  return (
    <main className="app-container">
      <AppHeader
        title="InGen Confidential Token Quickstart"
        address={address}
        balanceLabel="TREX"
        balance={ethBalance !== undefined ? Number(ethBalance).toFixed(4) : "—"}
      />
      <TokenSelector
        value={selectedTokenAddress ?? ""}
        options={validPairs.map((pair) => ({
          address: pair.confidentialTokenAddress,
          symbol: pair.underlying.symbol,
        }))}
        pending={isRegistryPending}
        error={isRegistryError}
        onChange={(event) => setSelectedTokenAddress(event.currentTarget.value as Address)}
      />

      {token && (
        <SelectedTokenPanel
          key={`${address}-${token.confidentialTokenAddress}`}
          address={address as Address}
          token={token}
          validPairs={validPairs}
          isIngen={isIngen}
          ethBalanceKey={ethBalanceKey}
        />
      )}
    </main>
  );
}
