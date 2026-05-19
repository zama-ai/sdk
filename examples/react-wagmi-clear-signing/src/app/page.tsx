"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseAbi, parseUnits } from "viem";
import { useAccount, useBalance, useConnect, useReadContract, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import {
  useConfidentialBalance,
  useIsAllowed,
  useAllowClearSigningIntent,
  useListPairs,
  useZamaSDK,
} from "@zama-fhe/react-sdk";
import type { Address, ClearSigningIntent, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { BalancesCard } from "@/components/BalancesCard";
import {
  ClearSigningConsole,
  type ClearSigningIntentEntry,
  type ClearSigningIntentSource,
  type ClearSigningTokenSnapshot,
} from "@/components/ClearSigningConsole";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { SEPOLIA_CHAIN_ID } from "@/lib/config";

// Standard ERC-20 balanceOf ABI — used by useReadContract for public balance polling.
// parseAbi is required — viem does not parse human-readable ABI strings automatically.
const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

export default function Home() {
  // ── Wagmi hooks — wallet state managed reactively by wagmi ──────────────────
  // The Zama wagmi config adapter subscribes to wagmi connection state internally,
  // so account and chain changes are handled automatically — no manual eth_accounts
  // polling or walletKey/refSeededRef remount pattern needed.
  const { address, chainId, isConnected } = useAccount();
  const { connect, isPending: isConnecting, error: connectError } = useConnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);
  const [clearSigningEntry, setClearSigningEntry] = useState<ClearSigningIntentEntry | null>(null);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

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
  const clearSigningToken = token
    ? ({
        underlyingSymbol: token.underlying.symbol,
        underlyingDecimals: token.underlying.decimals,
        confidentialSymbol: token.confidential.symbol,
        confidentialDecimals: token.confidential.decimals,
        networkName: "Sepolia",
      } satisfies ClearSigningTokenSnapshot)
    : undefined;

  function captureIntent(
    source: ClearSigningIntentSource,
    operation: string,
    intent: ClearSigningIntent,
  ) {
    setClearSigningEntry({
      source,
      operation,
      intent,
      token: clearSigningToken,
      timestamp: Date.now(),
    });
  }

  // ETH balance via wagmi transport (SEPOLIA_RPC_URL) — auto-updates on account switch.
  const { data: ethBalanceData, refetch: refetchEth } = useBalance({
    address,
    query: { enabled: isConnected && isSepolia },
  });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected) {
    // wagmi surfaces ProviderNotFoundError when no injected wallet is available.
    // Cast to string: wagmi's error discriminant union doesn't include ProviderNotFoundError
    // but the injected() connector does throw it at runtime when window.ethereum is absent.
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <div className="app-container connect-screen">
        <h1>Sepolia Clear Signing Intent Demo</h1>
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
        <h1>Sepolia Clear Signing Intent Demo</h1>
        <p className="subtitle">
          Preview human-readable SDK intents before Rabby, MetaMask, or another injected wallet
          opens.
        </p>
        <div className="connected-address">Connected: {address}</div>
        <div className="connected-address">
          ETH:{" "}
          {ethBalanceData !== undefined
            ? Number(formatEther(ethBalanceData.value)).toFixed(4)
            : "—"}
        </div>
        <div className="nav-links">
          <a href="/ledger" className="nav-link">
            Ledger DSK shield POC
          </a>
        </div>
      </div>

      <ClearSigningConsole entry={clearSigningEntry} onClear={() => setClearSigningEntry(null)} />

      {/* Token selector — populated from the on-chain WrappersRegistry */}
      <div className="card">
        <div className="card-title">Token</div>
        <select
          className="select"
          value={selectedTokenAddress ?? ""}
          onChange={(e) => {
            setSelectedTokenAddress(e.target.value as Address);
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

      {token && (
        <TokenWorkspace
          key={`${address}-${token.confidentialTokenAddress}`}
          address={address as Address}
          token={token}
          validPairs={validPairs}
          refetchEth={refetchEth}
          onIntent={captureIntent}
        />
      )}
      {!token && !isRegistryPending && <NoTokenWorkspace />}
    </div>
  );
}

function NoTokenWorkspace() {
  return (
    <>
      <BalancesCard
        formattedErc20="—"
        formattedConfidential="—"
        isLoadingConfidential={false}
        erc20Symbol=""
        onMint={() => {}}
        isMinting={false}
        mintDisabled
        mintError={null}
        mintTxHash={null}
        isAllowed={false}
        onDecrypt={() => {}}
        isDecrypting={false}
        decryptDisabled
        decryptError={null}
      />

      <div className="section-label">Operations</div>

      <div className="card">
        <div className="card-title">Shield — ERC-20 → Confidential</div>
        <button type="button" className="btn btn-primary" disabled>
          Shield
        </button>
      </div>

      <div className="card">
        <div className="card-title">Confidential Transfer</div>
        <button type="button" className="btn btn-primary" disabled>
          Transfer
        </button>
      </div>

      <div className="card">
        <div className="card-title">Unshield — Confidential → ERC-20</div>
        <button type="button" className="btn btn-primary" disabled>
          Unshield
        </button>
      </div>
    </>
  );
}

interface TokenWorkspaceProps {
  address: Address;
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
  refetchEth: () => unknown;
  onIntent: (
    source: ClearSigningIntentSource,
    operation: string,
    intent: ClearSigningIntent,
  ) => void;
}

function TokenWorkspace({ address, token, validPairs, refetchEth, onIntent }: TokenWorkspaceProps) {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  // Check whether cached credentials cover the selected confidential token.
  // This component only mounts once a token is selected, so no placeholder address is needed.
  const { data: isAllowed } = useIsAllowed({
    contractAddresses: [token.confidentialTokenAddress],
  });

  // Metadata for the selected token pair is sourced directly from the registry response
  // (useListPairs with metadata: true), removing separate metadata queries.
  const decimals = token.confidential.decimals;
  const erc20Decimals = token.underlying.decimals;
  const confidentialSymbol = token.confidential.symbol;
  const erc20Symbol = token.underlying.symbol;

  // Triggers the EIP-712 wallet signature to create FHE decrypt credentials.
  // All registry pairs are passed at once — a single signature covers all tokens,
  // so switching tokens does not require a second wallet prompt.
  const allowContracts = useMemo(
    () => validPairs.map((p) => p.confidentialTokenAddress),
    [validPairs],
  );
  const allowPreview = useAllowClearSigningIntent();
  const allowTokens = useMutation({
    mutationFn: async () => {
      await sdk.allow(allowContracts, {
        onClearSigningIntent: (intent) => onIntent("runtime", "Decrypt authorization", intent),
      });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });

  function handleDecrypt() {
    allowTokens.mutate();
  }

  function handleDecryptPreview() {
    allowPreview.mutate(
      { contracts: allowContracts },
      {
        onSuccess: (intent) => onIntent("preview", "Decrypt authorization", intent),
      },
    );
  }

  // ERC-20 balance via wagmi — auto-refetches when args (address) change on account switch.
  // Uses the wagmi HTTP transport, not window.ethereum, so polling is fast.
  const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
    address: token.tokenAddress,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  const refreshPublicBalances = () => {
    void refetchErc20();
    void refetchEth();
  };

  // Only run once the user has explicitly authorized decrypt for the selected token.
  // Prevents the hook from firing an EIP-712 prompt on mount (blind-signing anti-pattern).
  const balance = useConfidentialBalance(
    { address: token.confidentialTokenAddress, account: address },
    { enabled: !!isAllowed },
  );

  // Mint 10 whole tokens on the underlying ERC-20 contract.
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
    onSuccess: refreshPublicBalances,
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

  const formattedErc20 =
    erc20Balance !== undefined ? `${formatUnits(erc20Balance, erc20Decimals)} ${erc20Symbol}` : "—";
  const formattedConfidential =
    balance.data !== undefined
      ? `${formatUnits(balance.data, decimals)} ${confidentialSymbol}`
      : "—";

  return (
    <>
      <BalancesCard
        formattedErc20={formattedErc20}
        formattedConfidential={formattedConfidential}
        isLoadingConfidential={balance.isLoading}
        erc20Symbol={erc20Symbol}
        onMint={() => mint.mutate()}
        isMinting={mint.isPending}
        mintDisabled={false}
        mintError={mint.isError ? (mint.error?.message ?? null) : null}
        mintTxHash={mint.isSuccess && mint.data ? mint.data : null}
        isAllowed={!!isAllowed}
        onDecrypt={handleDecrypt}
        onDecryptPreview={handleDecryptPreview}
        isDecrypting={allowTokens.isPending}
        isPreviewingDecrypt={allowPreview.isPending}
        decryptError={allowTokens.isError ? (allowTokens.error?.message ?? "Signing failed") : null}
        decryptPreviewError={
          allowPreview.isError ? (allowPreview.error?.message ?? "Preview failed") : null
        }
      />

      {/* Pending unshield resume — checked for every registered token, not just the selected one.
          key includes address so the component remounts (re-checks IndexedDB) on wallet change. */}
      {validPairs.map((pair) => (
        <PendingUnshieldCard
          key={`${pair.confidentialTokenAddress}-${address}`}
          tokenAddress={pair.confidentialTokenAddress}
          label={pair.underlying.symbol}
          onSuccess={refreshPublicBalances}
        />
      ))}

      <div className="section-label">Operations</div>

      {/* key includes address and token so cards remount (inputs + state reset) on wallet or token change */}
      <ShieldCard
        key={`shield-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={erc20Decimals}
        symbol={erc20Symbol}
        publicBalance={erc20Balance}
        disabled={false}
        onSuccess={refreshPublicBalances}
        onIntent={onIntent}
      />

      <TransferCard
        key={`transfer-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={false}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshPublicBalances}
        onIntent={onIntent}
      />

      <UnshieldCard
        key={`unshield-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={false}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshPublicBalances}
        onIntent={onIntent}
      />

      {/* ── Delegation — token owner perspective ──────────────────────────────
          These cards are used by the wallet that OWNS the token.
          Grant or revoke another wallet's right to decrypt your balance. */}
      <div className="section-label">Delegation — as owner</div>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        disabled={false}
        onIntent={onIntent}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        disabled={false}
      />

      {/* ── Delegation — delegate perspective ────────────────────────────────
          This card is used by the wallet that RECEIVED a delegation.
          Decrypt another wallet's confidential balance on their behalf. */}
      <div className="section-label">Delegation — as delegate</div>

      <DecryptAsCard
        key={`decrypt-as-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={false}
        connectedAddress={address}
      />
    </>
  );
}
