"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, formatEther, formatUnits, http, parseAbi, parseUnits } from "viem";
import { useConnection, useConnect, useSwitchChain } from "wagmi";
import { hoodi } from "viem/chains";
import { injected } from "wagmi/connectors/injected";
import {
  useConfidentialBalance,
  useHasPermit,
  useGrantPermit,
  useListPairs,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import { balanceOfContract } from "@zama-fhe/sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query"; // query key builders for SDK-managed caches — /query subpath export
import type { Address } from "@zama-fhe/sdk";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { ActionScreen, AppHeader, TokenSelector } from "@/components/PageChrome";
import { HOODI_CHAIN_ID, HOODI_RPC_URL } from "@/lib/config";

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

// Stable zero address used as a hook placeholder when no token is selected yet.
// SDK hooks must not be called conditionally (React rules of hooks), so we pass this
// address with enabled: false until a real token pair is available from the registry.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// Routes ETH balance reads through the direct Hoodi RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcClient = createPublicClient({ chain: hoodi, transport: http(HOODI_RPC_URL) });

export default function Home() {
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isHoodi = chainId === HOODI_CHAIN_ID;

  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

  // Fetch all valid token pairs from the on-chain WrappersRegistry.
  // Registry address is resolved automatically from the connected chain via DefaultRegistryAddresses
  // (Hoodi: 0x1807aE2f693F8530DFB126D0eF98F2F2518F292f) — no configuration required.
  // The hook gates itself internally: it only runs once the chain ID is known.
  // metadata: true fetches name/symbol/decimals on-chain for both tokens in each pair,
  // removing the need for separate useMetadata calls.
  // isPending stays true until the first successful response — covers both the initial
  // disabled state (registry address not yet resolved internally) and the active-fetching state.
  // isLoading alone is insufficient: in TanStack Query v5, isLoading = isPending && isFetching,
  // so it is false when the query is disabled (enabled: false), causing a premature
  // "No tokens available" display before the chain ID has been resolved.
  const {
    data: pairsData,
    isPending: isRegistryPending,
    isError: isRegistryError,
  } = useListPairs({ metadata: true });

  // Keep only registered pairs with loaded metadata.
  // (see function definition above), then we keep only isValid pairs with metadata.
  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (pair): pair is TokenWrapperPairWithMetadata => pair.isValid && "underlying" in pair,
      ),
    [pairsData],
  );

  // Auto-select the first valid pair once the registry resolves.
  useEffect(() => {
    if (validPairs.length > 0 && selectedTokenAddress === null) {
      setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
    }
  }, [validPairs, selectedTokenAddress]);

  // Currently selected token pair, or undefined while the registry is loading.
  const token = validPairs.find((p) => p.confidentialTokenAddress === selectedTokenAddress);

  // Check whether cached credentials cover the currently selected confidential token.
  const { data: isAllowed } = useHasPermit(
    { contractAddresses: token ? [token.confidentialTokenAddress] : [] },
    { enabled: Boolean(token) },
  );

  // Metadata for the selected token pair — sourced directly from the registry response
  // (useListPairs with metadata: true). Defaults to safe zero values until the pair loads.
  const decimals = token?.confidential.decimals ?? 0;
  const erc20Decimals = token?.underlying.decimals ?? 0;
  const confidentialSymbol = token?.confidential.symbol ?? "";
  const erc20Symbol = token?.underlying.symbol ?? "";

  // Triggers the EIP-712 wallet signature to create FHE decrypt credentials.
  // All registry pairs are passed at once — a single signature covers all tokens,
  // so switching tokens does not require a second wallet prompt.
  const allowTokens = useGrantPermit();
  function handleDecrypt() {
    if (validPairs.length === 0) return;
    allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
  }

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    // Reads through the direct Hoodi RPC (fast, no wallet roundtrip).
    queryFn: () => rpcClient.getBalance({ address: address as Address }).then(formatEther),
    enabled: !!address && isHoodi,
  });

  // ERC-20 balance for the selected token. Disabled until a token pair is selected.
  const erc20BalanceKey = ["erc20-balance", token?.tokenAddress, address];
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () =>
      sdk.provider.readContract(
        balanceOfContract(token!.tokenAddress, address as Address),
      ) as Promise<bigint>,
    enabled: !!address && isHoodi && !!token,
  });

  const refreshBalances = () => {
    queryClient.invalidateQueries({ queryKey: erc20BalanceKey });
    queryClient.invalidateQueries({ queryKey: ethBalanceKey });
    // Invalidate the encrypted handle so useConfidentialBalance re-polls after
    // any operation that changes the confidential balance (shield, unshield, transfer).
    if (token) {
      queryClient.invalidateQueries({
        queryKey: zamaQueryKeys.confidentialBalance.token(token.confidentialTokenAddress),
      });
    }
  };

  // Only run once the user has explicitly authorized decrypt for the selected token.
  // Prevents the hook from firing an EIP-712 prompt on mount (blind-signing anti-pattern).
  // ZERO_ADDRESS is used as a stable placeholder while no token pair is selected —
  // the query is disabled (enabled: false) so no actual RPC call is made.
  const balance = useConfidentialBalance(
    {
      address: token?.confidentialTokenAddress ?? ZERO_ADDRESS,
      account: (address ?? ZERO_ADDRESS) as Address,
    },
    { enabled: !!address && isHoodi && !!isAllowed && !!token },
  );

  // Mint 10 whole tokens on the underlying ERC-20 contract.
  const mint = useMutation({
    mutationFn: async () => {
      const signer = sdk.signer;
      if (!signer) {
        throw new Error("Connect a wallet before minting tokens.");
      }
      const txHash = await signer.writeContract({
        address: token!.tokenAddress,
        abi: MINT_ABI,
        functionName: "mint",
        args: [address as Address, parseUnits("10", erc20Decimals)],
      });
      await sdk.provider.waitForTransactionReceipt(txHash);
      return txHash;
    },
    onSuccess: refreshBalances,
  });

  // Clear stale mutation state when the wallet account changes so the BalancesCard
  // does not show a pending/success/error badge belonging to the previous account.
  // Both reset functions are omitted from deps: useMutation returns a new object every
  // render, so including them would re-run this effect on every render. The resets are
  // idempotent so running them only on address changes is both correct and sufficient.
  useEffect(() => {
    mint.reset();
    allowTokens.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Guard on token too: if balance resolves before the registry, decimals defaults to 0
  // and symbol to "" — the raw integer would be displayed without unit or decimal conversion.
  const formattedErc20 =
    erc20Balance !== undefined && token
      ? `${formatUnits(erc20Balance, erc20Decimals)} ${erc20Symbol}`
      : "—";
  const formattedConfidential =
    balance.data !== undefined && token
      ? `${formatUnits(balance.data, decimals)} ${confidentialSymbol}`
      : "—";

  // Actions are disabled until the registry has loaded a valid token pair
  // and until the wallet is on the Hoodi network.
  const actionsDisabled = !isHoodi || !token;

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected || !address) {
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <ActionScreen
        title="Hoodi Confidential Token Quickstart"
        description="Connect your wallet to interact with ERC-7984 tokens on Hoodi testnet."
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
  if (!isHoodi) {
    return (
      <ActionScreen
        title="Hoodi Network Required"
        description={`This app only works on Hoodi testnet (chain ID ${HOODI_CHAIN_ID}).`}
        actionLabel="Switch to Hoodi"
        pendingLabel="Switching…"
        pending={isSwitching}
        onAction={() => switchChain({ chainId: hoodi.id })}
        error={switchError && "Could not switch to Hoodi. Please switch manually in your wallet."}
      />
    );
  }

  // ── Screen 3: Connected on Hoodi — main UI ─────────────────────────────────
  return (
    <main className="app-container">
      <AppHeader
        title="Hoodi Confidential Token Quickstart"
        address={address}
        balanceLabel="ETH"
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
        onChange={(event) => {
          setSelectedTokenAddress(event.currentTarget.value as Address);
          mint.reset();
        }}
      />

      <BalancesCard
        formattedErc20={formattedErc20}
        formattedConfidential={formattedConfidential}
        // balance.isLoading: decrypting via the cleartext relayer; balance.isFetching:
        // re-reading the encrypted handle from chain after a balance-changing operation.
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
        decryptDisabled={validPairs.length === 0}
        decryptError={allowTokens.isError ? (allowTokens.error?.message ?? "Signing failed") : null}
      />

      {/* Pending unshield resume — checked for every registered token, not just the selected one.
          key includes address so the component remounts (re-checks IndexedDB) on wallet change. */}
      {validPairs.map((pair) => (
        <PendingUnshieldCard
          key={`${pair.confidentialTokenAddress}-${address}`}
          tokenAddress={pair.confidentialTokenAddress}
          label={pair.underlying.symbol}
          onSuccess={refreshBalances}
        />
      ))}

      <h2 className="section-label">Operations</h2>

      {/* key includes address and selectedTokenAddress so cards remount (inputs + state reset) on wallet or token change */}
      <ShieldCard
        key={`shield-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        decimals={erc20Decimals}
        symbol={erc20Symbol}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <TransferCard
        key={`transfer-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshBalances}
      />

      <UnshieldCard
        key={`unshield-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshBalances}
      />

      {/* ── Delegation — token owner perspective ──────────────────────────────
          These cards are used by the wallet that OWNS the token.
          Grant or revoke another wallet's right to decrypt your balance. */}
      <h2 className="section-label">Delegation — as owner</h2>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        disabled={actionsDisabled}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        disabled={actionsDisabled}
      />

      {/* ── Delegation — delegate perspective ────────────────────────────────
          This card is used by the wallet that RECEIVED a delegation.
          Decrypt another wallet's confidential balance on their behalf. */}
      <h2 className="section-label">Delegation — as delegate</h2>

      <DecryptAsCard
        key={`decrypt-as-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        connectedAddress={address as Address}
      />
    </main>
  );
}
