"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ledgerProvider } from "@/lib/LedgerWebHIDProvider";

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

// Direct Hoodi RPC for ETH balance reads — independent of the Ledger device.
const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);

// Verify-address button states.
type VerifyStatus = "idle" | "verifying" | "done" | "error";

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);
  // BIP-44 account index — passed to ledgerProvider.connect(index).
  const [accountIndex, setAccountIndex] = useState(0);
  // Address verification status (on-device display).
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

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

  // ── Ledger device event listeners ────────────────────────────────────────────

  useEffect(() => {
    const handleAccountsChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["eth-balance"] });
      queryClient.invalidateQueries({ queryKey: ["erc20-balance"] });
    };
    ledgerProvider.on("accountsChanged", handleAccountsChanged);
    return () => ledgerProvider.removeListener("accountsChanged", handleAccountsChanged);
  }, [queryClient]);

  // Disconnect recovery: device unplugged mid-session → return to connect screen.
  useEffect(() => {
    const handleDisconnect = () => {
      setAddress(null);
      setChainId(null);
      setSelectedTokenAddress(null);
    };
    ledgerProvider.on("disconnect", handleDisconnect);
    return () => ledgerProvider.removeListener("disconnect", handleDisconnect);
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────────────

  async function connectWithIndex(index: number) {
    setAccountIndex(index);
    setConnectError(null);
    setIsConnecting(true);
    try {
      // Opens the WebHID device picker (or auto-selects a previously granted device),
      // reads the Ethereum address at the given BIP-44 path.
      const addr = await ledgerProvider.connect(index);
      const currentChainId = (await ledgerProvider.request({ method: "eth_chainId" })) as string;
      setChainId(currentChainId);
      setAddress(addr);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect Ledger device";
      console.warn("[page] Failed to connect Ledger:", message);
      setConnectError(message);
    } finally {
      setIsConnecting(false);
    }
  }

  // Called from the connect screen button — uses the currently selected accountIndex.
  function connect() {
    void connectWithIndex(accountIndex);
  }

  // ── Address verification ──────────────────────────────────────────────────────
  // Calls getAddress(path, display:true) — the Ledger device shows the address on
  // screen so the user can compare it with what the browser displays.

  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleVerifyAddress() {
    if (verifyTimerRef.current !== null) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
    setVerifyStatus("verifying");
    setVerifyError(null);
    try {
      await ledgerProvider.verifyAddress();
      setVerifyStatus("done");
      // Auto-reset the "Verified" label after 4 s.
      verifyTimerRef.current = setTimeout(() => {
        verifyTimerRef.current = null;
        setVerifyStatus("idle");
      }, 4000);
    } catch (err) {
      setVerifyStatus("error");
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
    }
  }

  // Reset verify state and mutation state when the connected address changes.
  useEffect(() => {
    if (verifyTimerRef.current !== null) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
    setVerifyStatus("idle");
    setVerifyError(null);
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

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Confidential Tokens — Ledger</h1>
        <p className="subtitle">
          Connect your Ledger device (Nano S, Nano S Plus, Nano X, Stax, Flex) to interact with
          ERC-7984 tokens on Hoodi testnet.
        </p>
        <p className="subtitle" style={{ fontSize: "0.85em", opacity: 0.7 }}>
          Make sure the Ethereum app is open on your device, then select an account and click the
          button below.
        </p>

        {/* BIP-44 account index selector */}
        <div style={{ margin: "0 auto 20px", maxWidth: "260px", textAlign: "left" }}>
          <label
            htmlFor="account-index"
            style={{ display: "block", fontSize: "13px", color: "#64748b", marginBottom: "6px" }}
          >
            Account (BIP-44 index)
          </label>
          <select
            id="account-index"
            className="select"
            value={accountIndex}
            onChange={(e) => setAccountIndex(Number(e.target.value))}
            style={{ width: "100%" }}
            disabled={isConnecting}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <option key={i} value={i}>
                Account #{i}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="btn btn-primary" onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Ledger"}
        </button>
        {connectError && <div className="alert alert-error card-status">{connectError}</div>}
      </div>
    );
  }

  // ── Screen 2: Wrong network (safety guard — unreachable in normal operation) ──
  // LedgerWebHIDProvider.eth_chainId always returns the Hoodi chain ID (560048).
  // This screen exists in case config.ts is changed to point at a different network.
  if (!isHoodi) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Network Required</h1>
        <p className="subtitle">
          This app targets Hoodi testnet (chain ID <strong>{HOODI_CHAIN_ID}</strong>). Detected
          chain ID: <strong>{chainId ? parseInt(chainId, 16) : "unknown"}</strong>.
        </p>
        <p className="subtitle" style={{ fontSize: "0.85em", opacity: 0.7 }}>
          Check that <code>HOODI_CHAIN_ID</code> in <code>src/lib/config.ts</code> is set to 560048
          and reconnect.
        </p>
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
        <div
          className="connected-address"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <span style={{ flexShrink: 0 }}>
            ETH: {ethBalance !== undefined ? Number(ethBalance).toFixed(4) : "—"}
          </span>

          {/* Account switcher — selects the BIP-44 index and reconnects on change. */}
          <select
            className="select"
            value={accountIndex}
            onChange={(e) => {
              void connectWithIndex(Number(e.target.value));
            }}
            disabled={isConnecting}
            style={{ flex: "1 1 auto", minWidth: 0 }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <option key={i} value={i}>
                Account #{i}
              </option>
            ))}
          </select>

          {/* Verify address — calls getAddress(path, display:true) on device. */}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleVerifyAddress}
            disabled={isConnecting || verifyStatus === "verifying"}
            style={{ flexShrink: 0 }}
          >
            {verifyStatus === "verifying"
              ? "Check Ledger…"
              : verifyStatus === "done"
                ? "✓ Verified"
                : "Verify address"}
          </button>

          {/* Disconnect — closes the transport and returns to the connect screen. */}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              void ledgerProvider.disconnect();
            }}
            disabled={isConnecting}
            style={{ flexShrink: 0 }}
          >
            Disconnect
          </button>
        </div>
        {verifyStatus === "error" && verifyError && (
          <div className="alert alert-error" style={{ marginTop: "8px", fontSize: "12px" }}>
            {verifyError}
          </div>
        )}
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
