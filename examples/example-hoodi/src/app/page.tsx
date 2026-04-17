"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseUnits, JsonRpcProvider } from "ethers";
import {
  useConfidentialBalance,
  useIsAllowed,
  useAllow,
  useListPairs,
  useZamaSDK,
  balanceOfContract,
} from "@zama-fhe/react-sdk";
import type { TokenWrapperPair, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query"; // query key builders for SDK-managed caches — /query subpath export
import type { Address } from "@zama-fhe/react-sdk";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import {
  HOODI_CHAIN_ID,
  HOODI_CHAIN_ID_HEX,
  HOODI_EXPLORER_URL,
  HOODI_RPC_URL,
} from "@/lib/config";
import { getEthereumProvider } from "@/lib/ethereum";

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = ["function mint(address to, uint256 amount)"];

// Stable zero address used as a hook placeholder when no token is selected yet.
// SDK hooks must not be called conditionally (React rules of hooks), so we pass this
// address with enabled: false until a real token pair is available from the registry.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// useListPairs with EthersSigner (ethers v6) returns objects where the SDK has spread
// an ethers Result to attach metadata. Spreading a Result only copies its own enumerable
// properties — the numeric indices 0, 1, 2. The named ABI fields (tokenAddress,
// confidentialTokenAddress, isValid) are non-enumerable prototype getters on the
// ethers Result class and are lost in the spread. This helper reads named fields first
// (correct for viem) and falls back to numeric index access (required for ethers).
function normalizePair(
  raw: TokenWrapperPair | TokenWrapperPairWithMetadata,
): TokenWrapperPairWithMetadata | null {
  if (!("underlying" in raw)) return null;
  const t = raw as unknown as readonly [Address, Address, boolean];
  return {
    tokenAddress: raw.tokenAddress ?? t[0],
    confidentialTokenAddress: raw.confidentialTokenAddress ?? t[1],
    isValid: raw.isValid ?? t[2],
    underlying: (raw as TokenWrapperPairWithMetadata).underlying,
    confidential: (raw as TokenWrapperPairWithMetadata).confidential,
  };
}

// Routes ETH balance reads through the direct Hoodi RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);

// Attempt to switch to Hoodi. If the network is unknown to the wallet (error 4902),
// prompt to add it. Errors from wallet_switchEthereumChain (including 4001 user rejection)
// are swallowed — the caller re-reads the current chainId to determine the outcome.
// Errors from wallet_addEthereumChain propagate to the caller.
async function switchToHoodi(ethereum: NonNullable<ReturnType<typeof getEthereumProvider>>) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HOODI_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    if ((err as { code: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HOODI_CHAIN_ID_HEX,
            chainName: "Hoodi",
            nativeCurrency: { name: "Hoodi Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [HOODI_RPC_URL],
            blockExplorerUrls: [HOODI_EXPLORER_URL],
          },
        ],
      });
    }
    // wallet_switchEthereumChain errors other than 4902 (including 4001 rejection) are
    // intentionally ignored — chainId is re-read in the finally block of the caller.
  }
}

export default function Home() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Case-insensitive: some wallets return uppercase hex (e.g. "0x88BB0" instead of "0x88bb0").
  const isHoodi = chainId?.toLowerCase() === HOODI_CHAIN_ID_HEX;

  // Stable reference from the QueryClientProvider in providers.tsx.
  // Used in handleAccountsChanged (inside the useEffect below) to invalidate balance caches.
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

  // Normalize and filter pairs: normalizePair handles the EthersSigner/viem compat issue
  // (see function definition above), then we keep only isValid pairs with metadata.
  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? [])
        .map(normalizePair)
        .filter((p): p is TokenWrapperPairWithMetadata => p !== null && p.isValid),
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
  const { data: isAllowed } = useIsAllowed({
    contractAddresses: token ? [token.confidentialTokenAddress] : [],
    query: { enabled: Boolean(token) },
  });

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

  // Attempt to switch to Hoodi and update chainId based on the actual result.
  // Safe to call concurrently — duplicate calls are harmless (last write wins).
  async function handleSwitchToHoodi() {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    setIsSwitching(true);
    setSwitchFailed(false);
    try {
      await switchToHoodi(ethereum);
    } catch (err) {
      console.error("Failed to switch to Hoodi:", err);
    } finally {
      try {
        const current = (await ethereum.request({ method: "eth_chainId" })) as string;
        setChainId(current);
        setSwitchFailed(current.toLowerCase() !== HOODI_CHAIN_ID_HEX);
      } catch {
        // If the chainId read fails (wallet disconnected, extension crashed),
        // still clear the switching state so the UI doesn't freeze.
      } finally {
        setIsSwitching(false);
      }
    }
  }

  // Detect existing connection on page load and listen for account/chain changes.
  // Note: providers.tsx has a second accountsChanged listener that manages the
  // ZamaProvider lifecycle (signer remount). This listener handles UI-level state only.
  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      setIsInitializing(false);
      return;
    }

    // Read both accounts and chainId in parallel, then auto-switch if needed.
    Promise.all([
      ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ])
      .then(([accounts, currentChainId]) => {
        const detectedAddress = accounts[0] ?? null;
        setAddress(detectedAddress);
        setChainId(currentChainId);

        // Already connected but on the wrong network — trigger switch automatically
        // so the user is prompted to add/switch Hoodi without having to click anything.
        if (detectedAddress && currentChainId.toLowerCase() !== HOODI_CHAIN_ID_HEX) {
          handleSwitchToHoodi();
        }
      })
      .catch((err) => console.error("Failed to detect wallet state:", err))
      .finally(() => setIsInitializing(false));

    const handleAccountsChanged = (accounts: unknown) => {
      setAddress((accounts as string[])[0] ?? null);
      // Invalidate only balance queries — registry/metadata is address-independent.
      queryClient.invalidateQueries({ queryKey: ["eth-balance"] });
      queryClient.invalidateQueries({ queryKey: ["erc20-balance"] });
    };
    const handleChainChanged = (chainId: unknown) => setChainId(chainId as string);

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      setConnectError(
        "No Ethereum wallet found. Please install an EIP-1193 browser wallet (e.g. Rabby, MetaMask, or Phantom).",
      );
      return;
    }

    setConnectError(null);
    setIsConnecting(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      // Switch before setting address: both chainId and address are then known
      // when the first non-connect-screen render fires, avoiding a brief flash
      // of the wrong-network screen between the two state updates.
      await handleSwitchToHoodi();
      setAddress(accounts[0] ?? null);
    } catch (err) {
      console.error("Failed to connect wallet:", err);
      setConnectError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    // Reads through the direct Hoodi RPC (fast, no wallet roundtrip).
    queryFn: () => rpcProvider.getBalance(address!).then(formatEther),
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
        queryKey: zamaQueryKeys.confidentialHandle.token(token.confidentialTokenAddress),
      });
    }
  };

  // Only run once the user has explicitly authorized decrypt for the selected token.
  // Prevents the hook from firing an EIP-712 prompt on mount (blind-signing anti-pattern).
  // ZERO_ADDRESS is used as a stable placeholder while no token pair is selected —
  // the query is disabled (enabled: false) so no actual RPC call is made.
  const balance = useConfidentialBalance(
    { tokenAddress: token?.confidentialTokenAddress ?? ZERO_ADDRESS },
    { enabled: !!address && isHoodi && !!isAllowed && !!token },
  );

  // Mint 10 whole tokens on the underlying ERC-20 contract.
  const mint = useMutation({
    mutationFn: async () => {
      const txHash = await sdk.signer.writeContract({
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

  // ── Screen 0: Initializing ────────────────────────────────────────────────
  // Shown while eth_accounts / eth_chainId are resolving — prevents a flash of the
  // "Connect Wallet" screen during the brief re-initialization that follows a
  // ZamaProvider remount (wallet switch or chain change).
  if (isInitializing) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Confidential Token Quickstart</h1>
      </div>
    );
  }

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on Hoodi testnet.
        </p>
        <button type="button" className="btn btn-primary" onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {connectError && <div className="alert alert-error card-status">{connectError}</div>}
      </div>
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isHoodi) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Network Required</h1>
        <p className="subtitle">
          This app only works on the Hoodi testnet (chain ID {HOODI_CHAIN_ID}). Switch your wallet
          to continue — Hoodi will be added to your wallet automatically if it is not already
          configured.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSwitchToHoodi}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Hoodi"}
        </button>
        {switchFailed && (
          <div className="alert alert-error card-status">
            Could not switch to Hoodi. Please switch manually in your wallet.
          </div>
        )}
      </div>
    );
  }

  // ── Screen 3: Connected on Hoodi — main UI ─────────────────────────────────
  return (
    <div className="app-container">
      {/* Header */}
      <div className="app-header">
        <h1>Hoodi Confidential Token Quickstart</h1>
        <div className="connected-address">Connected: {address}</div>
        <div className="connected-address">
          ETH: {ethBalance !== undefined ? Number(ethBalance).toFixed(4) : "—"}
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
        // balance.isLoading: decrypting it via RelayerCleartext (Phase 2).
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
