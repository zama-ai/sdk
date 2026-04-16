"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseUnits, parseAbi, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  useConfidentialBalance,
  useIsAllowed,
  useAllow,
  useListPairs,
  useTotalSupply,
  useZamaSDK,
  balanceOfContract,
} from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
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
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_EXPLORER_URL,
  SEPOLIA_RPC_URL,
} from "@/lib/config";
import { getEthereumProvider } from "@/lib/ethereum";

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
// parseAbi is required — viem does not parse human-readable ABI strings automatically.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

// Routes ETH balance reads through the direct Sepolia RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
});

// Stable zero address used as a hook placeholder when no token is selected yet.
// SDK hooks must not be called conditionally (React rules of hooks), so we pass this
// address with enabled: false until a real token pair is available from the registry.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// Attempt to switch to Sepolia. If the network is unknown to the wallet (error 4902),
// prompt to add it. Errors from wallet_switchEthereumChain (including 4001 user rejection)
// are swallowed — the caller re-reads the current chainId to determine the outcome.
// Errors from wallet_addEthereumChain propagate to the caller.
async function switchToSepolia(ethereum: NonNullable<ReturnType<typeof getEthereumProvider>>) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    if ((err as { code: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [SEPOLIA_RPC_URL],
            blockExplorerUrls: [SEPOLIA_EXPLORER_URL],
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

  // Case-insensitive: some wallets return uppercase hex (e.g. "0xAA36A7" instead of "0xaa36a7").
  const isSepolia = chainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX;

  // Stable reference from the QueryClientProvider in providers.tsx.
  // Used in handleAccountsChanged (inside the useEffect below) to invalidate balance caches.
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

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
  // With ViemSigner, named fields (tokenAddress, confidentialTokenAddress, isValid) are
  // directly accessible — no normalizePair workaround needed (unlike EthersSigner).
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

  // Reads the wrapper's plaintext inferred total supply (inferredTotalSupply() on-chain).
  // Unlike confidentialTotalSupply (which returns an encrypted handle), this is a plain
  // bigint that does not require FHE credentials — useful for public dashboards.
  const { data: totalSupply } = useTotalSupply(token?.confidentialTokenAddress ?? ZERO_ADDRESS, {
    enabled: !!token,
  });

  // Triggers the EIP-712 wallet signature to create FHE decrypt credentials.
  // All registry pairs are passed at once — a single signature covers all tokens,
  // so switching tokens does not require a second wallet prompt.
  const allowTokens = useAllow();
  function handleDecrypt() {
    if (validPairs.length === 0) return;
    allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
  }

  // Attempt to switch to Sepolia and update chainId based on the actual result.
  // Safe to call concurrently — duplicate calls are harmless (last write wins).
  async function handleSwitchToSepolia() {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    setIsSwitching(true);
    setSwitchFailed(false);
    try {
      await switchToSepolia(ethereum);
    } catch (err) {
      console.error("Failed to switch to Sepolia:", err);
    } finally {
      const current = (await ethereum.request({ method: "eth_chainId" })) as string;
      setChainId(current);
      setIsSwitching(false);
      // If we're still on the wrong network after the attempt, tell the user.
      setSwitchFailed(current.toLowerCase() !== SEPOLIA_CHAIN_ID_HEX);
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

    Promise.all([
      ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ])
      .then(([accounts, currentChainId]) => {
        setAddress(accounts[0] ?? null);
        setChainId(currentChainId);
      })
      .catch((err) => console.error("Failed to detect wallet state:", err))
      .finally(() => setIsInitializing(false));

    const handleAccountsChanged = (accounts: unknown) => {
      setAddress((accounts as string[])[0] ?? null);
      // MetaMask fires accountsChanged on page load for already-connected sites, before
      // the Promise.all above resolves. Re-fetch chainId here so we never end up with
      // address set but chainId null (which renders a persistent "Sepolia Required" screen).
      (ethereum.request({ method: "eth_chainId" }) as Promise<string>)
        .then(setChainId)
        .catch((err) => console.error("[chainId refresh] eth_chainId failed:", err));
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

      const currentChainId = (await ethereum.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] ?? null);
      setChainId(currentChainId);
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
    // Reads through the direct Sepolia RPC (fast, no wallet roundtrip).
    queryFn: () =>
      rpcClient.getBalance({ address: address! as Address }).then((b) => formatEther(b)),
    enabled: !!address && isSepolia,
  });

  // Use the ERC-20 address from the registry pair directly — no on-chain underlyingContract() lookup needed.
  const erc20BalanceKey = ["erc20-balance", token?.tokenAddress, address];
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () =>
      sdk.signer.readContract(
        balanceOfContract(token!.tokenAddress, address as Address),
      ) as Promise<bigint>,
    enabled: !!address && isSepolia && !!token,
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
    { enabled: !!address && isSepolia && !!isAllowed && !!token },
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

  // ── Screen 0: Initializing ────────────────────────────────────────────────
  // Shown while eth_accounts / eth_chainId are resolving — prevents a flash of
  // the "Connect Wallet" screen during the re-initialization that follows a
  // ZamaProvider remount (wallet switch or chain change).
  if (isInitializing) {
    return (
      <div className="app-container connect-screen">
        <h1>Sepolia Confidential Token Quickstart</h1>
      </div>
    );
  }

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <div className="app-container connect-screen">
        <h1>Sepolia Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on Sepolia testnet.
        </p>
        <button type="button" className="btn btn-primary" onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {connectError && <div className="alert alert-error card-status">{connectError}</div>}
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
          onClick={handleSwitchToSepolia}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Sepolia"}
        </button>
        {switchFailed && (
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
        {token && totalSupply !== undefined && (
          <p className="token-meta">
            Total supply: {formatUnits(totalSupply, decimals)} {confidentialSymbol}
          </p>
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
