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
import { HOODI_CHAIN_ID, HOODI_CHAIN_ID_HEX, HOODI_RPC_URL } from "@/lib/config";
import { onProviderDiscovered, type EIP1193Provider } from "@/lib/ledgerProvider";

const MINT_ABI = ["function mint(address to, uint256 amount)"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// See example-hoodi/page.tsx for the rationale behind this helper.
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

// Direct Hoodi RPC for ETH balance reads — independent of the Ledger Button.
const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);

export default function Home() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  // Ref to the raw Ledger Button EIP-1193 provider (arrives via EIP-6963).
  const [ethProvider, setEthProvider] = useState<EIP1193Provider | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  const isHoodi = chainId?.toLowerCase() === HOODI_CHAIN_ID_HEX;

  const queryClient = useQueryClient();
  const sdk = useZamaSDK();
  const { data: isAllowed } = useIsAllowed();

  const {
    data: pairsData,
    isPending: isRegistryPending,
    isError: isRegistryError,
  } = useListPairs({ metadata: true });

  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? [])
        .map(normalizePair)
        .filter((p): p is TokenWrapperPairWithMetadata => p !== null && p.isValid),
    [pairsData],
  );

  useEffect(() => {
    if (validPairs.length > 0 && selectedTokenAddress === null) {
      setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
    }
  }, [validPairs, selectedTokenAddress]);

  const token = validPairs.find((p) => p.confidentialTokenAddress === selectedTokenAddress);

  const decimals = token?.confidential.decimals ?? 0;
  const erc20Decimals = token?.underlying.decimals ?? 0;
  const confidentialSymbol = token?.confidential.symbol ?? "";
  const erc20Symbol = token?.underlying.symbol ?? "";

  const allowTokens = useAllow();
  function handleDecrypt() {
    if (validPairs.length === 0) return;
    allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
  }

  // ── Ledger Button provider discovery & connection detection ──────────────────
  //
  // Unlike MetaMask (which injects window.ethereum synchronously), the Ledger
  // Button provider arrives asynchronously via EIP-6963. providers.tsx calls
  // initializeLedgerProvider() and publishes the provider via notifyProviderDiscovered.
  // Here we subscribe via onProviderDiscovered and seed initial state.
  //
  // There is NO wallet_switchEthereumChain call here — the Ledger Button does not
  // support Hoodi (chainId 560048). The user must configure their device manually.
  // Screen 2 explains this requirement clearly.
  useEffect(() => {
    const unsub = onProviderDiscovered((provider: EIP1193Provider) => {
      setEthProvider(provider);

      // Detect existing connection (already-connected wallet, page refresh).
      Promise.all([
        provider.request({ method: "eth_accounts" }) as Promise<string[]>,
        provider.request({ method: "eth_chainId" }) as Promise<string>,
      ])
        .then(([accounts, currentChainId]) => {
          setAddress(accounts[0] ?? null);
          setChainId(currentChainId);
        })
        .catch((err) => console.error("[page] Failed to detect initial wallet state:", err))
        .finally(() => setIsInitializing(false));

      // React to runtime account / chain changes.
      const handleAccountsChanged = (accounts: unknown) => {
        setAddress((accounts as string[])[0] ?? null);
        queryClient.invalidateQueries({ queryKey: ["eth-balance"] });
        queryClient.invalidateQueries({ queryKey: ["erc20-balance"] });
      };
      const handleChainChanged = (newChainId: unknown) => setChainId(newChainId as string);

      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("chainChanged", handleChainChanged);

      // No cleanup for provider.removeListener — the provider is module-level
      // and the listeners should remain active for the lifetime of the page.
    });

    // Safety fallback: if no Ledger Button appears within 8 s (e.g. script blocked,
    // browser extension conflict), stop showing the initializing screen.
    const timeout = setTimeout(() => setIsInitializing(false), 8000);

    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    if (!ethProvider) {
      setConnectError("Ledger Button not yet ready. Please wait a moment and try again.");
      return;
    }
    setConnectError(null);
    setIsConnecting(true);
    try {
      // eth_requestAccounts triggers the Ledger Button connect UI (account selector).
      const accounts = (await ethProvider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const currentChainId = (await ethProvider.request({
        method: "eth_chainId",
      })) as string;
      setChainId(currentChainId);
      setAddress(accounts[0] ?? null);
    } catch (err) {
      console.error("[page] Failed to connect Ledger:", err);
      setConnectError(err instanceof Error ? err.message : "Failed to connect Ledger device");
    } finally {
      setIsConnecting(false);
    }
  }

  useEffect(() => {
    allowTokens.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    queryFn: () => rpcProvider.getBalance(address!).then(formatEther),
    enabled: !!address && isHoodi,
  });

  const erc20BalanceKey = ["erc20-balance", token?.tokenAddress, address];
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () =>
      sdk.signer.readContract(
        balanceOfContract(token!.tokenAddress, address as Address),
      ) as Promise<bigint>,
    enabled: !!address && isHoodi && !!token,
  });

  const refreshBalances = () => {
    queryClient.invalidateQueries({ queryKey: erc20BalanceKey });
    queryClient.invalidateQueries({ queryKey: ethBalanceKey });
    if (token) {
      queryClient.invalidateQueries({
        queryKey: zamaQueryKeys.confidentialHandle.token(token.confidentialTokenAddress),
      });
    }
  };

  const balance = useConfidentialBalance(
    { tokenAddress: token?.confidentialTokenAddress ?? ZERO_ADDRESS },
    { enabled: !!address && isHoodi && !!isAllowed && !!token },
  );

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

  useEffect(() => {
    mint.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const formattedErc20 =
    erc20Balance !== undefined && token
      ? `${formatUnits(erc20Balance, erc20Decimals)} ${erc20Symbol}`
      : "—";
  const formattedConfidential =
    balance.data !== undefined && token
      ? `${formatUnits(balance.data, decimals)} ${confidentialSymbol}`
      : "—";

  const actionsDisabled = !isHoodi || !token;

  // ── Screen 0: Initializing ─────────────────────────────────────────────────
  if (isInitializing) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Confidential Tokens — Ledger</h1>
        <p className="subtitle">Initializing Ledger Button…</p>
      </div>
    );
  }

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Confidential Tokens — Ledger</h1>
        <p className="subtitle">
          Connect your Ledger device to interact with ERC-7984 tokens on Hoodi testnet.
        </p>
        <p className="subtitle" style={{ fontSize: "0.85em", opacity: 0.7 }}>
          Click the Ledger icon in the bottom-right corner, or use the button below.
        </p>
        <button type="button" className="btn btn-primary" onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Ledger"}
        </button>
        {connectError && <div className="alert alert-error card-status">{connectError}</div>}
      </div>
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  // The Ledger Button does not support wallet_switchEthereumChain for Hoodi
  // (chainId 560048 — not in its hard-coded chain list). The user must configure
  // their Ledger device manually.
  if (!isHoodi) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Network Required</h1>
        <p className="subtitle">
          Your Ledger is currently on chain ID{" "}
          <strong>{chainId ? parseInt(chainId, 16) : "unknown"}</strong>. This app requires the
          Hoodi testnet (chain ID <strong>{HOODI_CHAIN_ID}</strong>).
        </p>
        <div className="alert alert-error card-status" style={{ textAlign: "left" }}>
          <strong>How to switch to Hoodi on Ledger:</strong>
          <ol style={{ margin: "0.5em 0 0 1.2em", padding: 0 }}>
            <li>Open Ledger Live and go to Settings → Developer mode (enable if needed).</li>
            <li>
              In Ledger Live, add a Hoodi account: My Ledger → search "Ethereum Hoodi" or add a
              custom EVM network with RPC{" "}
              <code style={{ fontSize: "0.85em" }}>https://rpc.hoodi.ethpandaops.io</code> and chain
              ID <code>560048</code>.
            </li>
            <li>Sync your Ledger Live account, then reconnect here.</li>
          </ol>
        </div>
        <button type="button" className="btn btn-primary" onClick={connect}>
          Reconnect
        </button>
      </div>
    );
  }

  // ── Screen 3: Connected on Hoodi — main UI ─────────────────────────────────
  return (
    <div className="app-container">
      <div className="app-header">
        <h1>Hoodi Confidential Tokens — Ledger</h1>
        <div className="connected-address">Connected: {address}</div>
        <div className="connected-address">
          ETH: {ethBalance !== undefined ? Number(ethBalance).toFixed(4) : "—"}
        </div>
      </div>

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

      {validPairs.map((pair) => (
        <PendingUnshieldCard
          key={`${pair.confidentialTokenAddress}-${address}`}
          tokenAddress={pair.confidentialTokenAddress}
          label={pair.underlying.symbol}
          onSuccess={refreshBalances}
        />
      ))}

      <div className="section-label">Operations</div>

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
