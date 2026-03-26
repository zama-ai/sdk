"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseAbi, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { useConfidentialBalance, useMetadata, useZamaSDK } from "@zama-fhe/react-sdk";
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
import { SEPOLIA_CHAIN_ID } from "@/lib/config";

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Add your ERC-7984 token pairs here.
// - erc20: the underlying ERC-20 token (source of funds for shield, mint target)
// - confidential: the ERC-7984 wrapper contract (used for all SDK hooks)
// All SDK hooks and the Token API use `token.confidential` as the tokenAddress.
const TOKENS = {
  usdc: {
    label: "USDC Mock",
    erc20: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF" as Address,
    confidential: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address,
  },
  usdt: {
    label: "USDT Mock",
    erc20: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0" as Address,
    confidential: "0x4E7B06D78965594eB5EF5414c357ca21E1554491" as Address,
  },
} as const;

// Standard ERC-20 balanceOf ABI — used by useReadContract for public balance polling.
// parseAbi is required — viem does not parse human-readable ABI strings automatically.
const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

type TokenKey = keyof typeof TOKENS;

export default function Home() {
  // ── Wagmi hooks — wallet state managed reactively by wagmi ──────────────────
  // WagmiSigner subscribes to wagmiConfig.watchConnection internally, so account
  // and chain changes are handled automatically — no manual eth_accounts polling
  // or walletKey/refSeededRef remount pattern needed (unlike EthersSigner/ViemSigner).
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending: isConnecting, error: connectError } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [selectedToken, setSelectedToken] = useState<TokenKey>("usdc");

  const token = TOKENS[selectedToken];
  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  // Stable reference from the QueryClientProvider in providers.tsx.
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

  // useMetadata reads name/symbol/decimals from any contract that exposes the standard
  // ERC-20 metadata interface — it works equally on plain ERC-20s and ERC-7984 wrappers.
  // erc20Metadata drives shield amounts and ERC-20 balance display.
  // cTokenMetadata drives transfer/unshield amounts and confidential balance display.
  const cTokenMetadata = useMetadata(token.confidential, { enabled: isSepolia });
  const erc20Metadata = useMetadata(token.erc20, { enabled: isSepolia });

  const decimals = cTokenMetadata.data?.decimals ?? 0;
  const erc20Decimals = erc20Metadata.data?.decimals ?? 0;
  const confidentialSymbol = cTokenMetadata.data?.symbol ?? "";
  const erc20Symbol = erc20Metadata.data?.symbol ?? "";

  // ETH balance via wagmi transport (SEPOLIA_RPC_URL) — auto-updates on account switch.
  const { data: ethBalanceData, refetch: refetchEth } = useBalance({
    address,
    query: { enabled: isConnected && isSepolia },
  });

  // ERC-20 balance via wagmi — auto-refetches when args (address) change on account switch.
  // Uses the wagmi HTTP transport, not window.ethereum, so polling is fast.
  const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
    address: token.erc20,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: isConnected && isSepolia },
  });

  const refreshBalances = () => {
    void refetchErc20();
    void refetchEth();
    // Invalidate the encrypted handle so useConfidentialBalance re-polls after
    // any operation that changes the confidential balance (shield, unshield, transfer).
    queryClient.invalidateQueries({
      queryKey: zamaQueryKeys.confidentialHandle.token(token.confidential),
    });
  };

  const balance = useConfidentialBalance(
    { tokenAddress: token.confidential },
    { enabled: isConnected && isSepolia },
  );

  // Mint 10 whole tokens on the underlying ERC-20 contract.
  const mint = useMutation({
    mutationFn: async () => {
      const txHash = await sdk.signer.writeContract({
        address: token.erc20,
        abi: MINT_ABI,
        functionName: "mint",
        args: [address as Address, parseUnits("10", erc20Decimals)],
      });
      await sdk.signer.waitForTransactionReceipt(txHash);
      return txHash;
    },
    onSuccess: refreshBalances,
  });

  // Clear stale mint state when the wallet account changes so the BalancesCard
  // does not show a pending/success/error badge belonging to the previous account.
  // mint.reset is omitted from deps: useMutation returns a new object every render,
  // so including it would re-run this effect on every render. The reset is idempotent
  // so running it only on address changes is both correct and sufficient.
  useEffect(() => {
    mint.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const formattedErc20 =
    erc20Balance !== undefined && erc20Metadata.data
      ? `${formatUnits(erc20Balance, erc20Decimals)} ${erc20Symbol}`
      : "—";
  const formattedConfidential =
    balance.data !== undefined && cTokenMetadata.data
      ? `${formatUnits(balance.data, decimals)} ${confidentialSymbol}`
      : "—";

  // Actions are disabled until both metadata are loaded (decimals needed to parse amounts)
  // and until the wallet is on the Sepolia network.
  const actionsDisabled = !isSepolia || !cTokenMetadata.data || !erc20Metadata.data;

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

      {/* Token selector */}
      <div className="card">
        <div className="card-title">Token</div>
        <select
          className="select"
          value={selectedToken}
          onChange={(e) => {
            setSelectedToken(e.target.value as TokenKey);
            mint.reset();
          }}
        >
          {(Object.keys(TOKENS) as TokenKey[]).map((key) => (
            <option key={key} value={key}>
              {TOKENS[key].label}
            </option>
          ))}
        </select>
        {(!cTokenMetadata.data || !erc20Metadata.data) && (
          <p className="token-meta">Loading token metadata…</p>
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
      />

      {/* Pending unshield resume — checked for every token, not just the selected one.
          key includes address so the component remounts (re-checks IndexedDB) on wallet change. */}
      {(Object.entries(TOKENS) as [TokenKey, (typeof TOKENS)[TokenKey]][]).map(([key, t]) => (
        <PendingUnshieldCard
          key={`${key}-${address}`}
          tokenAddress={t.confidential}
          label={t.label}
          onSuccess={refreshBalances}
        />
      ))}

      <div className="section-label">Operations</div>

      {/* key includes address and selectedToken so cards remount (inputs + state reset) on wallet or token change */}
      <ShieldCard
        key={`shield-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        underlyingAddress={token.erc20}
        decimals={erc20Decimals}
        symbol={erc20Symbol}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <TransferCard
        key={`transfer-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <UnshieldCard
        key={`unshield-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      {/* ── Delegation — token owner perspective ──────────────────────────────
          These cards are used by the wallet that OWNS the token.
          Grant or revoke another wallet's right to decrypt your balance. */}
      <div className="section-label">Delegation — as owner</div>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
      />

      {/* ── Delegation — delegate perspective ────────────────────────────────
          This card is used by the wallet that RECEIVED a delegation.
          Decrypt another wallet's confidential balance on their behalf. */}
      <div className="section-label">Delegation — as delegate</div>

      <DecryptAsCard
        key={`decrypt-as-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={!cTokenMetadata.data}
        connectedAddress={address as Address}
      />
    </div>
  );
}
