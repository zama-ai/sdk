"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseAbi, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import {
  useConfidentialBalance,
  useIsAllowed,
  useAllow,
  useListPairs,
  useZamaSDK,
  useActivityFeed,
} from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import type { Address } from "@zama-fhe/react-sdk";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { ActivityFeedCard } from "@/components/ActivityFeedCard";
import { SEPOLIA_CHAIN_ID } from "@/lib/config";

// Standard ERC-20 balanceOf ABI — used by useReadContract for public balance polling.
// parseAbi is required — viem does not parse human-readable ABI strings automatically.
const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

// Stable zero address used as a hook placeholder when no token is selected yet.
// SDK hooks must not be called conditionally (React rules of hooks), so we pass this
// address with enabled: false until a real token pair is available from the registry.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export default function Home() {
  // ── Wagmi hooks — wallet state managed reactively by wagmi ──────────────────
  // WagmiSigner subscribes to wagmiConfig.watchConnection internally, so account
  // and chain changes are handled automatically — no manual eth_accounts polling
  // or walletKey/refSeededRef remount pattern needed (unlike EthersSigner/ViemSigner).
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending: isConnecting, error: connectError } = useConnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  // Stable reference from the QueryClientProvider in providers.tsx.
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();
  const publicClient = usePublicClient();

  // Check whether FHE decrypt credentials are already cached (no wallet prompt).
  // Returns true if a valid session exists, undefined/false otherwise.
  const { data: isAllowed } = useIsAllowed();

  // Fetch all valid token pairs from the on-chain WrappersRegistry.
  // Registry address is resolved automatically from the connected chain via DefaultRegistryAddresses
  // (Sepolia: 0x2f0750Bbb0A246059d80e94c454586a7F27a128e) — no configuration required.
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

  // Filter pairs: keep only isValid pairs with metadata.
  // With WagmiSigner (viem-based), named fields (tokenAddress, confidentialTokenAddress, isValid)
  // are directly accessible — no normalizePair workaround needed (unlike EthersSigner).
  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (p): p is TokenWrapperPairWithMetadata => p.isValid && "underlying" in p,
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

  // Metadata for the selected token pair — sourced directly from the registry response
  // (useListPairs with metadata: true). Defaults to safe zero values until the pair loads.
  const decimals = token?.confidential.decimals ?? 0;
  const erc20Decimals = token?.underlying.decimals ?? 0;
  const confidentialSymbol = token?.confidential.symbol ?? "";
  const erc20Symbol = token?.underlying.symbol ?? "";

  // Triggers the EIP-712 wallet signature to create FHE decrypt credentials.
  // All registry pairs are passed at once — a single signature covers all tokens,
  // so switching tokens does not require a second wallet prompt.
  const allowTokens = useAllow();
  function handleDecrypt() {
    if (validPairs.length === 0) return;
    allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
  }

  // ETH balance via wagmi transport (SEPOLIA_RPC_URL) — auto-updates on account switch.
  const { data: ethBalanceData, refetch: refetchEth } = useBalance({
    address,
    query: { enabled: isConnected && isSepolia },
  });

  // ERC-20 balance via wagmi — auto-refetches when args (address) change on account switch.
  // Uses the wagmi HTTP transport, not window.ethereum, so polling is fast.
  const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
    address: token?.tokenAddress ?? ZERO_ADDRESS,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: isConnected && isSepolia && !!token },
  });

  const refreshBalances = () => {
    void refetchErc20();
    void refetchEth();
    queryClient.invalidateQueries({ queryKey: activityLogsKey });
    // Invalidate the encrypted handle so useConfidentialBalance re-polls after
    // any operation that changes the confidential balance (shield, unshield, transfer).
    if (token) {
      queryClient.invalidateQueries({
        queryKey: zamaQueryKeys.confidentialHandle.token(token.confidentialTokenAddress),
      });
    }
  };

  // Only run once the user has explicitly authorized decrypt (isAllowed).
  // Prevents the hook from firing an EIP-712 prompt on mount (blind-signing anti-pattern).
  // ZERO_ADDRESS is used as a stable placeholder while no token pair is selected —
  // the query is disabled (enabled: false) so no actual RPC call is made.
  const balance = useConfidentialBalance(
    { tokenAddress: token?.confidentialTokenAddress ?? ZERO_ADDRESS },
    { enabled: isConnected && isSepolia && !!isAllowed && !!token },
  );

  // Fetch recent event logs from the confidential token contract for the activity feed.
  // wagmi's usePublicClient() returns the underlying viem PublicClient, whose getLogs()
  // returns objects matching the SDK's RawLog & ActivityLogMetadata interface directly.
  const activityLogsKey = ["activity-logs", token?.confidentialTokenAddress, address];
  const { data: rawLogs } = useQuery({
    queryKey: activityLogsKey,
    queryFn: async () => {
      const currentBlock = await publicClient!.getBlockNumber();
      return publicClient!.getLogs({
        address: token!.confidentialTokenAddress,
        fromBlock: currentBlock > 5_000n ? currentBlock - 5_000n : 0n,
        toBlock: "latest",
      });
    },
    enabled: isConnected && isSepolia && !!token && !!publicClient,
  });

  // Two-phase activity feed: instantly classifies logs, then batch-decrypts encrypted amounts.
  // decrypt is gated on isAllowed — without credentials, amounts show as "Encrypted".
  const {
    data: activity,
    isLoading: isActivityLoading,
    isError: isActivityError,
  } = useActivityFeed({
    tokenAddress: token?.confidentialTokenAddress ?? ZERO_ADDRESS,
    userAddress: address,
    logs: rawLogs,
    decrypt: !!isAllowed,
  });

  // Mint 10 whole tokens on the underlying ERC-20 contract.
  const mint = useMutation({
    mutationFn: async () => {
      const txHash = await sdk.signer.writeContract({
        address: token!.tokenAddress,
        abi: MINT_ABI,
        functionName: "mint",
        args: [address as Address, parseUnits("10", erc20Decimals)],
      });
      await sdk.signer.waitForTransactionReceipt(txHash);
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
  // and until the wallet is on the Sepolia network.
  const actionsDisabled = !isSepolia || !token;

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected) {
    // wagmi surfaces ProviderNotFoundError when no injected wallet is available.
    // Cast to string: wagmi's error discriminant union doesn't include ProviderNotFoundError
    // but the injected() connector does throw it at runtime when window.ethereum is absent.
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <div className="app-container connect-screen">
        <h1>Sepolia Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on Sepolia testnet.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => connect({ connector: injected() })}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {isNoWallet && (
          <div className="alert alert-error card-status">
            No Ethereum wallet found. Please install an EIP-1193 browser wallet (e.g. Rabby,
            MetaMask, or Phantom).
          </div>
        )}
        {connectError && !isNoWallet && (
          <div className="alert alert-error card-status">{connectError.message}</div>
        )}
      </div>
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isSepolia) {
    return (
      <div className="app-container connect-screen">
        <h1>Sepolia Network Required</h1>
        <p className="subtitle">
          This app only works on the Sepolia testnet (chain ID {SEPOLIA_CHAIN_ID}). Switch your
          wallet to continue.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Sepolia"}
        </button>
        {switchError && (
          <div className="alert alert-error card-status">
            Could not switch to Sepolia. Please switch manually in your wallet.
          </div>
        )}
      </div>
    );
  }

  // ── Screen 3: Connected on Sepolia — main UI ───────────────────────────────
  return (
    <div className="app-container">
      {/* Header */}
      <div className="app-header">
        <h1>Sepolia Confidential Token Quickstart</h1>
        <div className="connected-address">Connected: {address}</div>
        <div className="connected-address">
          ETH:{" "}
          {ethBalanceData !== undefined
            ? Number(formatEther(ethBalanceData.value)).toFixed(4)
            : "—"}
        </div>
      </div>

      {/* Token selector — populated from the on-chain WrappersRegistry */}
      <div className="card">
        <div className="card-title">Token</div>
        <select
          className="select"
          value={selectedTokenAddress ?? ""}
          onChange={(e) => {
            setSelectedTokenAddress(e.target.value as Address);
            mint.reset();
          }}
          disabled={isRegistryPending || isRegistryError || validPairs.length === 0}
        >
          {(isRegistryPending || selectedTokenAddress === null) && (
            <option value="" disabled>
              {isRegistryPending || validPairs.length > 0 ? "Loading…" : "No tokens available"}
            </option>
          )}
          {validPairs.map((pair) => (
            <option key={pair.confidentialTokenAddress} value={pair.confidentialTokenAddress}>
              {pair.underlying.symbol}
            </option>
          ))}
        </select>
        {isRegistryPending && <p className="token-meta">Loading tokens from registry…</p>}
        {!isRegistryPending && isRegistryError && (
          <p className="token-meta">Failed to load tokens from registry.</p>
        )}
        {!isRegistryPending && !isRegistryError && validPairs.length === 0 && (
          <p className="token-meta">No tokens available.</p>
        )}
      </div>

      <BalancesCard
        formattedErc20={formattedErc20}
        formattedConfidential={formattedConfidential}
        // handleQuery.isLoading: fetching the encrypted handle from chain (Phase 1).
        // balance.isLoading: decrypting it via RelayerWeb (Phase 2).
        isLoadingConfidential={balance.handleQuery.isLoading || balance.isLoading}
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

      <ActivityFeedCard
        activity={activity}
        isLoading={isActivityLoading}
        isError={isActivityError}
        decimals={decimals}
        symbol={confidentialSymbol}
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

      <div className="section-label">Operations</div>

      {/* key includes address and selectedTokenAddress so cards remount (inputs + state reset) on wallet or token change */}
      <ShieldCard
        key={`shield-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        underlyingAddress={token?.tokenAddress ?? ZERO_ADDRESS}
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
      <div className="section-label">Delegation — as owner</div>

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
      <div className="section-label">Delegation — as delegate</div>

      <DecryptAsCard
        key={`decrypt-as-${address}-${selectedTokenAddress}`}
        tokenAddress={token?.confidentialTokenAddress ?? ZERO_ADDRESS}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        connectedAddress={address as Address}
      />
    </div>
  );
}
