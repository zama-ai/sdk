"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseUnits, JsonRpcProvider } from "ethers";
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
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_EXPLORER_URL,
  SEPOLIA_RPC_URL,
} from "@/lib/config";
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
const MINT_ABI = ["function mint(address to, uint256 amount)"];

// Routes ETH balance reads through the direct Sepolia RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcProvider = new JsonRpcProvider(SEPOLIA_RPC_URL);

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

type TokenKey = keyof typeof TOKENS;

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("usdc");
  const [connectError, setConnectError] = useState<string | null>(null);

  const token = TOKENS[selectedToken];
  // Case-insensitive: some wallets return uppercase hex (e.g. "0xAA36A7" instead of "0xaa36a7").
  const isSepolia = chainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX;

  // Stable reference from the QueryClientProvider in providers.tsx.
  // Used in handleAccountsChanged (inside the useEffect below) to invalidate balance caches.
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

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

      // Switch before setting address: both chainId and address are then known
      // when the first non-connect-screen render fires, avoiding a brief flash
      // of the wrong-network screen between the two state updates.
      await handleSwitchToSepolia();
      setAddress(accounts[0] ?? null);
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
    queryFn: () => rpcProvider.getBalance(address!).then(formatEther),
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
  // mint.reset is stable (TanStack Query guarantee) — safe to include in deps.
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
        disabled={!isSepolia}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        disabled={!isSepolia}
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
        disabled={!isSepolia || !cTokenMetadata.data}
        connectedAddress={address as Address}
      />
    </div>
  );
}
