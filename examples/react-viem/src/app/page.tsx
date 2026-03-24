"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseUnits, parseAbi, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  useConfidentialBalance,
  useMetadata,
  useZamaSDK,
  balanceOfContract,
} from "@zama-fhe/react-sdk";
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
import { SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX, SEPOLIA_RPC_URL } from "@/lib/config";
import { getEthereumProvider } from "@/lib/ethereum";

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

type TokenKey = keyof typeof TOKENS;

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("usdc");
  const [connectError, setConnectError] = useState<string | null>(null);

  const token = TOKENS[selectedToken];
  const isSepolia = chainId === SEPOLIA_CHAIN_ID_HEX;

  // Stable reference from the QueryClientProvider in providers.tsx.
  // Used in handleAccountsChanged (inside the useEffect below) to invalidate balance caches.
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

  // Detect existing connection on page load and listen for account/chain changes.
  // Note: providers.tsx has a second accountsChanged listener that manages the
  // ZamaProvider lifecycle (signer remount). This listener handles UI-level state only.
  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;

    Promise.all([
      ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ])
      .then(([accounts, currentChainId]) => {
        setAddress(accounts[0] ?? null);
        setChainId(currentChainId);
      })
      .catch((err) => console.error("Failed to detect wallet state:", err));

    const handleAccountsChanged = (accounts: unknown) => {
      setAddress((accounts as string[])[0] ?? null);
      // Invalidate only balance queries — metadata (name/symbol/decimals) is address-independent.
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

  // useMetadata reads name/symbol/decimals from any contract that exposes the standard
  // ERC-20 metadata interface — it works equally on plain ERC-20s and ERC-7984 wrappers.
  // erc20Metadata drives shield amounts and ERC-20 balance display.
  // cTokenMetadata drives transfer/unshield amounts and confidential balance display.
  const cTokenMetadata = useMetadata(token.confidential);
  const erc20Metadata = useMetadata(token.erc20);

  const decimals = cTokenMetadata.data?.decimals ?? 0;
  const erc20Decimals = erc20Metadata.data?.decimals ?? 0;
  const confidentialSymbol = cTokenMetadata.data?.symbol ?? "";
  const erc20Symbol = erc20Metadata.data?.symbol ?? "";

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    // Reads through the direct Sepolia RPC (fast, no wallet roundtrip).
    queryFn: () =>
      rpcClient.getBalance({ address: address! as Address }).then((b) => formatEther(b)),
    enabled: !!address && isSepolia,
  });

  // Use the ERC-20 address from config directly — no on-chain underlyingContract() lookup needed.
  const erc20BalanceKey = ["erc20-balance", token.erc20, address];
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () =>
      sdk.signer.readContract(
        balanceOfContract(token.erc20, address as Address),
      ) as Promise<bigint>,
    enabled: !!address && isSepolia,
  });

  const refreshBalances = () => {
    queryClient.invalidateQueries({ queryKey: erc20BalanceKey });
    queryClient.invalidateQueries({ queryKey: ethBalanceKey });
    // Invalidate the encrypted handle so useConfidentialBalance re-polls after
    // any operation that changes the confidential balance (shield, unshield, transfer).
    queryClient.invalidateQueries({
      queryKey: zamaQueryKeys.confidentialHandle.token(token.confidential),
    });
  };

  const balance = useConfidentialBalance({ tokenAddress: token.confidential });

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
  // mint.reset is stable across renders (TanStack Query guarantee) — safe to include in deps.
  useEffect(() => {
    mint.reset();
  }, [address, mint.reset]);

  // Guard on metadata too: if balance resolves before metadata, decimals defaults to 0
  // and symbol to "" — the raw integer would be displayed without unit or decimal conversion.
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
          This app only works on the Sepolia testnet (chain ID {SEPOLIA_CHAIN_ID}).
        </p>
        <p className="subtitle">
          Please switch to <strong>Sepolia</strong> in your wallet — this page will update
          automatically.
        </p>
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
        mintError={mint.isError ? (mint.error?.message ?? "Mint failed") : null}
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
