"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, formatEther, parseUnits, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { AuthState, ClientState } from "@turnkey/react-wallet-kit";
import {
  useZamaSDK,
  useListPairs,
  useConfidentialBalance,
  useShield,
  useConfidentialTransfer,
  useUnshield,
  useResumeUnshield,
  clearPendingUnshield,
  savePendingUnshield,
  loadPendingUnshield,
  ZamaSDKEvents,
  balanceOfContract,
  allowanceContract,
  approveContract,
  indexedDBStorage,
} from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/react-sdk";
import { useTurnkeyZama } from "@/components/providers";
import { explorerUrl, RPC_URL, viemChain, isTestnet } from "@/lib/config";

// Placeholder used while no token pair is selected, to satisfy React's rule
// that hooks must be called unconditionally.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const MINT_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function txLink(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    authState,
    clientState,
    walletAddress,
    isSignerReady,
    initError,
    needsWalletCreation,
    isCreatingWallet,
    handleLogin,
    createEmbeddedWallet,
  } = useTurnkeyZama();

  if (initError) {
    return <CenteredState title="Wallet initialization failed" body={initError} tone="error" />;
  }

  if (authState !== AuthState.Authenticated) {
    return (
      <LoginState
        clientState={clientState}
        onLogin={() => {
          void handleLogin().catch(console.error);
        }}
      />
    );
  }

  if (needsWalletCreation) {
    return (
      <CenteredState
        title="Create a Turnkey wallet"
        body="Your Turnkey session is authenticated, but no embedded wallet is available yet. Create one to continue with the Zama flows."
        action={
          <button
            onClick={() => {
              void createEmbeddedWallet().catch(console.error);
            }}
            disabled={isCreatingWallet}
            className="btn btn-primary min-w-44"
          >
            {isCreatingWallet ? "Creating…" : "Create wallet"}
          </button>
        }
      />
    );
  }

  if (!walletAddress || !isSignerReady) {
    return <CenteredState title="Connecting wallet…" body="Loading your Turnkey account." />;
  }

  return <AuthenticatedHome walletAddress={walletAddress} />;
}

function AuthenticatedHome({ walletAddress }: { walletAddress: Address }) {
  const sdk = useZamaSDK();
  const { waitForTransactionReceipt } = useTurnkeyZama();

  const [selectedTokenAddressState, setSelectedTokenAddress] = useState<Address | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [pendingUnshieldHash, setPendingUnshieldHash] = useState<Hex | null>(null);

  // ── Registry: all valid token pairs from the on-chain WrappersRegistry ────
  const { data: pairsData, isPending: isRegistryPending } = useListPairs({ metadata: true });

  const validPairs = useMemo(
    () =>
      (pairsData?.items ?? []).filter(
        (p): p is TokenWrapperPairWithMetadata => p.isValid && "underlying" in p,
      ),
    [pairsData],
  );

  const selectedTokenAddress =
    selectedTokenAddressState ?? validPairs[0]?.confidentialTokenAddress ?? null;

  const selectedPair = useMemo(
    () => validPairs.find((p) => p.confidentialTokenAddress === selectedTokenAddress) ?? null,
    [validPairs, selectedTokenAddress],
  );

  // ── ETH balance — fetched via TanStack Query ──────────────────────────────
  const { data: ethBalance } = useQuery({
    queryKey: ["ethBalance", walletAddress],
    queryFn: async () => {
      const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [walletAddress, "latest"],
          id: 1,
        }),
      });

      const data = (await response.json()) as { result?: string };
      return data.result ? BigInt(data.result) : 0n;
    },
  });

  // ── Public ERC-20 balance — fetched and refreshed via TanStack Query ─────
  const {
    data: publicBalance,
    refetch: refetchPublicBalance,
  } = useQuery({
    queryKey: ["publicBalance", selectedPair?.tokenAddress, walletAddress],
    enabled: !!selectedPair,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!selectedPair) {
        throw new Error("No token selected");
      }

      return (await sdk.signer.readContract(
        balanceOfContract(selectedPair.tokenAddress, walletAddress),
      )) as bigint;
    },
  });

  // ── Pending unshield — check IndexedDB on token change ───────────────────
  useEffect(() => {
    let cancelled = false;

    async function syncPendingUnshield() {
      if (!selectedPair) {
        if (!cancelled) setPendingUnshieldHash(null);
        return;
      }

      try {
        const hash = await loadPendingUnshield(
          indexedDBStorage,
          selectedPair.confidentialTokenAddress,
        );
        if (!cancelled) setPendingUnshieldHash(hash as Hex | null);
      } catch {
        if (!cancelled) setPendingUnshieldHash(null);
      }
    }

    void syncPendingUnshield();
    return () => {
      cancelled = true;
    };
  }, [selectedPair]);

  // ── Zama hooks — always called; ZERO_ADDRESS + enabled:false when no pair ─
  const tokenAddress = selectedPair?.confidentialTokenAddress ?? ZERO_ADDRESS;

  const {
    data: confidentialBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    error: balanceError,
  } = useConfidentialBalance({ tokenAddress }, { enabled: !!selectedPair });

  const shield = useShield({ tokenAddress });
  const transfer = useConfidentialTransfer({ tokenAddress });
  const unshield = useUnshield({ tokenAddress, wrapperAddress: tokenAddress });
  const resumeUnshield = useResumeUnshield({ tokenAddress, wrapperAddress: tokenAddress });

  // ── ERC-20 approval — awaits receipt before shield is submitted ───────────
  //
  // The SDK's internal #ensureAllowance submits the approve tx but does NOT
  // await its receipt before submitting the wrap tx. Alchemy simulates wrap
  // against the committed state (allowance = 0) → revert. Fix: do the approval
  // ourselves with a confirmed receipt, then pass approvalStrategy: "skip".
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

      // Reset non-zero allowance first — required by USDT-like tokens.
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

  // ── Mint 10 units of the underlying ERC-20 (testnet only) ────────────────
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
    } catch (e: unknown) {
      setMintError(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setIsMinting(false);
    }
  }, [sdk, selectedPair, refetchPublicBalance, waitForTransactionReceipt, walletAddress]);

  // ── Shared onSuccess for unshield + resume — clears pending state ─────────
  const handleUnshieldSuccess = useCallback(() => {
    clearPendingUnshield(indexedDBStorage, tokenAddress).catch(console.error);
    setPendingUnshieldHash(null);
    void refetchPublicBalance();
  }, [tokenAddress, refetchPublicBalance]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 space-y-4 font-sans">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Turnkey × Zama — Confidential Tokens
        </h1>
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
          <span>
            Wallet:{" "}
            <a
              href={`${explorerUrl}/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-600 hover:underline"
            >
              {shortAddr(walletAddress)}
            </a>
          </span>
          <span>{viemChain.name}</span>
          <span>
            ETH: {ethBalance !== undefined ? parseFloat(formatEther(ethBalance)).toFixed(4) : "…"}
          </span>
        </div>
      </div>

      {/* ── Token selector ── */}
      <div className="card">
        <div className="card-title">Token</div>
        {isRegistryPending ? (
          <p className="text-sm text-zinc-500">Loading tokens from registry…</p>
        ) : (
          <select
            value={selectedTokenAddress ?? ""}
            onChange={(e) => {
              setSelectedTokenAddress(e.target.value as Address);
              setPendingUnshieldHash(null);
            }}
            className="input w-full"
          >
            {validPairs.map((pair) => (
              <option key={pair.confidentialTokenAddress} value={pair.confidentialTokenAddress}>
                {pair.confidential.symbol} / {pair.underlying.symbol}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedPair && (
        <>
          {/* ── Balances ── */}
          <div className="card">
            <div className="card-title">Balances</div>

            {/* Public ERC-20 row */}
            <div className="flex items-center justify-between py-2.5 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-sm text-zinc-500">Public (ERC-20)</span>
              <div className="flex items-center gap-2.5">
                <BalanceAmount
                  value={publicBalance ?? null}
                  decimals={selectedPair.underlying.decimals}
                  symbol={selectedPair.underlying.symbol}
                />
                {isTestnet && (
                  <button
                    onClick={handleMint}
                    disabled={isMinting}
                    className="btn btn-secondary py-0.5 px-2 text-xs"
                  >
                    {isMinting ? "Minting…" : "Mint 10"}
                  </button>
                )}
              </div>
            </div>

            {/* Confidential balance row */}
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-zinc-500">Confidential (Private)</span>
              {isBalanceLoading ? (
                <span className="text-sm text-zinc-400">Decrypting…</span>
              ) : isBalanceError ? (
                <span className="text-sm text-red-500">Error</span>
              ) : (
                <BalanceAmount
                  value={confidentialBalance ?? null}
                  decimals={selectedPair.confidential.decimals}
                  symbol={selectedPair.confidential.symbol}
                />
              )}
            </div>

            {/* Status messages */}
            {isTestnet && mintError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-all">{mintError}</p>
            )}
            {isBalanceError && balanceError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1 break-all">
                {balanceError.message}
              </p>
            )}
          </div>

          {/* ── Operations divider ── */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Operations
            </span>
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          </div>

          {/* Resume unshield — shown only when phase 1 completed but phase 2 was interrupted */}
          {pendingUnshieldHash && (
            <ResumeUnshieldCard
              resumeUnshield={resumeUnshield}
              txHash={pendingUnshieldHash}
              onSuccess={handleUnshieldSuccess}
            />
          )}

          {/* Shield */}
          <ShieldCard
            shield={shield}
            decimals={selectedPair.underlying.decimals}
            symbol={selectedPair.underlying.symbol}
            onSuccess={() => {
              void refetchPublicBalance();
            }}
            preApprove={preApproveShield}
          />

          {/* Confidential transfer */}
          <TransferCard
            transfer={transfer}
            decimals={selectedPair.confidential.decimals}
            symbol={selectedPair.confidential.symbol}
          />

          {/* Unshield */}
          <UnshieldCard
            unshield={unshield}
            tokenAddress={tokenAddress}
            decimals={selectedPair.confidential.decimals}
            symbol={selectedPair.confidential.symbol}
            onSuccess={handleUnshieldSuccess}
          />
        </>
      )}
    </div>
  );
}

function LoginState({
  clientState,
  onLogin,
}: {
  clientState: ClientState | undefined;
  onLogin: () => void;
}) {
  const isLoading = clientState === ClientState.Loading;

  return (
    <CenteredState
      title="Authenticate with Turnkey"
      body="Log in or sign up with Turnkey to initialize the wallet session used by the Zama SDK."
      action={
        <button onClick={onLogin} disabled={isLoading} className="btn btn-primary min-w-44">
          {isLoading ? "Loading…" : "Log in / Sign up"}
        </button>
      }
    />
  );
}

function CenteredState({
  title,
  body,
  tone = "neutral",
  action,
}: {
  title: string;
  body: string;
  tone?: "neutral" | "error";
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-4">
      <div className="card w-full text-center">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p
          className={`mt-2 text-sm ${tone === "error" ? "font-mono text-red-600 dark:text-red-400 break-all" : "text-zinc-500"}`}
        >
          {body}
        </p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BalanceAmount({
  value,
  decimals,
  symbol,
}: {
  value: bigint | null;
  decimals: number;
  symbol: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {value !== null ? formatUnits(value, decimals) : "—"}
      </span>
      <span className="text-xs text-zinc-400">{symbol}</span>
    </div>
  );
}

function ShieldCard({
  shield,
  decimals,
  symbol,
  onSuccess,
  preApprove,
}: {
  shield: ReturnType<typeof useShield>;
  decimals: number;
  symbol: string;
  onSuccess: () => void;
  preApprove: (amount: bigint) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function handleShield() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed) return;
    setApproveError(null);
    setIsApproving(true);
    try {
      await preApprove(parsed);
    } catch (e: unknown) {
      setApproveError(e instanceof Error ? e.message : "Approval failed");
      return;
    } finally {
      setIsApproving(false);
    }
    shield.mutate(
      { amount: parsed, approvalStrategy: "skip" },
      {
        onSuccess: () => {
          setAmount("");
          onSuccess();
        },
      },
    );
  }

  const isPending = isApproving || shield.isPending;
  const buttonLabel = isApproving ? "Approving…" : shield.isPending ? "Shielding…" : "Shield";

  return (
    <div className="card">
      <div className="card-title">Shield — ERC-20 → Confidential</div>
      <div className="flex items-center gap-2 mb-3">
        <input
          className="input flex-1"
          type="number"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span className="token-badge">{symbol}</span>
      </div>
      <button
        onClick={handleShield}
        disabled={isPending || !parseAmountSafe(amount, decimals)}
        className="btn btn-primary w-full"
      >
        {buttonLabel}
      </button>
      {approveError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400 break-all">{approveError}</p>
      )}
      <MutationStatus mutation={shield} />
    </div>
  );
}

function TransferCard({
  transfer,
  decimals,
  symbol,
}: {
  transfer: ReturnType<typeof useConfidentialTransfer>;
  decimals: number;
  symbol: string;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const addressInvalid = to.length > 0 && !isAddress(to);

  function handleTransfer() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed || !isAddress(to)) return;
    transfer.mutate(
      { to: to as Address, amount: parsed },
      {
        onSuccess: () => {
          setTo("");
          setAmount("");
        },
      },
    );
  }

  return (
    <div className="card">
      <div className="card-title">Confidential Transfer</div>
      <div className="flex items-center gap-2 mb-2">
        <input
          className="input flex-1"
          type="number"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span className="token-badge">{symbol}</span>
      </div>
      <input
        className={`input w-full ${addressInvalid ? "border-red-400 focus:border-red-500 focus:ring-red-500 mb-1" : "mb-3"}`}
        type="text"
        placeholder="Recipient address (0x…)"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      {addressInvalid && <p className="text-xs text-red-500 mb-3">Invalid Ethereum address</p>}
      <button
        onClick={handleTransfer}
        disabled={transfer.isPending || !parseAmountSafe(amount, decimals) || !isAddress(to)}
        className="btn btn-primary w-full"
      >
        {transfer.isPending ? "Sending…" : "Transfer"}
      </button>
      <MutationStatus mutation={transfer} />
    </div>
  );
}

function UnshieldCard({
  unshield,
  tokenAddress,
  decimals,
  symbol,
  onSuccess,
}: {
  unshield: ReturnType<typeof useUnshield>;
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<1 | 2>(1);

  useEffect(() => {
    function handlePhase1(e: Event) {
      const txHash = (e as CustomEvent<{ txHash: Hex }>).detail.txHash;
      savePendingUnshield(indexedDBStorage, tokenAddress, txHash).catch(console.error);
    }
    window.addEventListener(ZamaSDKEvents.UnshieldPhase1Submitted, handlePhase1);
    return () => window.removeEventListener(ZamaSDKEvents.UnshieldPhase1Submitted, handlePhase1);
  }, [tokenAddress]);

  function handleUnshield() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed) return;
    setPhase(1);
    unshield.mutate(
      { amount: parsed, onFinalizing: () => setPhase(2) },
      {
        onSuccess: () => {
          setAmount("");
          setPhase(1);
          onSuccess();
        },
      },
    );
  }

  return (
    <div className="card">
      <div className="card-title">Unshield — Confidential → ERC-20</div>
      <p className="text-xs text-zinc-500 mb-3">
        Two-phase operation: unwrap then FHE-decrypt + finalize. If interrupted between phases, use
        Resume Unshield.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <input
          className="input flex-1"
          type="number"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span className="token-badge">{symbol}</span>
      </div>
      <button
        onClick={handleUnshield}
        disabled={unshield.isPending || !parseAmountSafe(amount, decimals)}
        className="btn btn-primary w-full"
      >
        {unshield.isPending
          ? phase === 1
            ? "Unshielding… (1/2 unwrap)"
            : "Unshielding… (2/2 finalize)"
          : "Unshield"}
      </button>
      <MutationStatus mutation={unshield} />
    </div>
  );
}

function ResumeUnshieldCard({
  resumeUnshield,
  txHash,
  onSuccess,
}: {
  resumeUnshield: ReturnType<typeof useResumeUnshield>;
  txHash: Hex;
  onSuccess: () => void;
}) {
  return (
    <div className="card border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
      <div className="card-title text-amber-700 dark:text-amber-300">
        Pending Unshield — Resume Required
      </div>
      <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
        Phase 1 completed but phase 2 (finalize) was interrupted.
      </p>
      <p className="font-mono text-xs text-zinc-500 break-all mb-3">
        Unwrap tx:{" "}
        <a href={txLink(txHash)} target="_blank" rel="noopener noreferrer" className="underline">
          {shortAddr(txHash)}
        </a>
      </p>
      <button
        onClick={() => resumeUnshield.mutate({ unwrapTxHash: txHash }, { onSuccess })}
        disabled={resumeUnshield.isPending}
        className="btn btn-primary w-full"
      >
        {resumeUnshield.isPending ? "Resuming…" : "Resume Unshield (Phase 2)"}
      </button>
      <MutationStatus mutation={resumeUnshield} />
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function MutationStatus({
  mutation,
}: {
  mutation: {
    isSuccess: boolean;
    isError: boolean;
    error: Error | null;
    data?: unknown;
  };
}) {
  if (!mutation.isSuccess && !mutation.isError) return null;

  if (mutation.isError) {
    const err = mutation.error;
    const cause = (err as { cause?: Error } | null)?.cause;
    return (
      <div className="mt-2 space-y-0.5">
        <p className="text-sm text-red-600 dark:text-red-400 break-all">
          {err?.message ?? "Unknown error"}
        </p>
        {cause?.message && cause.message !== err?.message && (
          <p className="text-xs text-red-500 dark:text-red-400 break-all font-mono">
            {cause.message}
          </p>
        )}
      </div>
    );
  }

  const hash = (mutation.data as { txHash?: Hex } | null)?.txHash;
  return (
    <p className="mt-2 text-sm text-green-600 dark:text-green-400">
      ✓ Success
      {hash && (
        <>
          {" — "}
          <a
            href={txLink(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono text-xs"
          >
            {shortAddr(hash)}
          </a>
        </>
      )}
    </p>
  );
}

function parseAmountSafe(value: string, decimals: number): bigint | null {
  try {
    if (!value || isNaN(Number(value)) || Number(value) <= 0) return null;
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}
