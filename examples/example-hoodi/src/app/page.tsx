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
import {
  HOODI_CHAIN_ID,
  HOODI_CHAIN_ID_HEX,
  HOODI_EXPLORER_URL,
  HOODI_RPC_URL,
} from "@/lib/config";
import { getEthereumProvider } from "@/lib/ethereum";

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Add your ERC-7984 token pairs here.
// - erc20: the underlying ERC-20 token (source of funds for shield, mint target)
// - confidential: the ERC-7984 wrapper contract (used for all SDK hooks)
// For ERC-7984 tokens, the SDK hooks (useUnshield, useConfidentialTransfer) and the
// Token API (sdk.createToken().shield()) all use tokenAddress === token.confidential.
const TOKENS = {
  usdt: {
    label: "USDT Mock",
    erc20: "0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b" as Address,
    confidential: "0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75" as Address,
  },
  test: {
    label: "Test Token",
    erc20: "0x7740F913dC24D4F9e1A72531372c3170452B2F87" as Address,
    confidential: "0x7B1d59BbCD291DAA59cb6C8C5Bc04de1Afc4Aba1" as Address,
  },
} as const;

// Standard ERC-20 mint ABI — both test tokens expose mint(address, uint256).
const MINT_ABI = ["function mint(address to, uint256 amount)"];

// Routes ETH balance reads through the direct Hoodi RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);

type TokenKey = keyof typeof TOKENS;

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
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("usdt");
  const [connectError, setConnectError] = useState<string | null>(null);

  const token = TOKENS[selectedToken];
  const isHoodi = chainId === HOODI_CHAIN_ID_HEX;

  // Stable reference from the QueryClientProvider in providers.tsx.
  // Used in handleAccountsChanged (inside the useEffect below) to invalidate balance caches.
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

  // Attempt to switch to Hoodi and update chainId based on the actual result.
  // Safe to call concurrently — duplicate calls are harmless (last write wins).
  async function handleSwitchToHoodi() {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    setIsSwitching(true);
    try {
      await switchToHoodi(ethereum);
    } catch (err) {
      console.error("Failed to switch to Hoodi:", err);
    } finally {
      const current = (await ethereum.request({ method: "eth_chainId" })) as string;
      setChainId(current);
      setIsSwitching(false);
    }
  }

  // Detect existing connection on page load and listen for account/chain changes.
  // Note: providers.tsx has a second accountsChanged listener that manages the
  // ZamaProvider lifecycle (signer remount). This listener handles UI-level state only.
  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;

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
        if (detectedAddress && currentChainId !== HOODI_CHAIN_ID_HEX) {
          handleSwitchToHoodi();
        }
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
  }, []);

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
      setAddress(accounts[0] ?? null);

      // Switch to Hoodi — updates chainId based on actual result, never throws.
      await handleSwitchToHoodi();
    } catch (err) {
      console.error("Failed to connect wallet:", err);
      setConnectError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }

  // useMetadata fetches name/symbol/decimals for each contract.
  // erc20Metadata is used for the shield amount and ERC-20 balance display;
  // cTokenMetadata (ERC-7984) is used for transfer/unshield amounts and confidential balance display.
  const cTokenMetadata = useMetadata(token.confidential);
  const erc20Metadata = useMetadata(token.erc20);

  const decimals = cTokenMetadata.data?.decimals ?? 0;
  const erc20Decimals = erc20Metadata.data?.decimals ?? 0;
  const confidentialSymbol = cTokenMetadata.data?.symbol ?? "";
  const erc20Symbol = erc20Metadata.data?.symbol ?? "";

  const ethBalanceKey = ["eth-balance", address];
  const { data: ethBalance } = useQuery({
    queryKey: ethBalanceKey,
    // Reads through the direct Hoodi RPC (fast, no wallet roundtrip).
    queryFn: () => rpcProvider.getBalance(address!).then(formatEther),
    enabled: !!address && isHoodi,
  });

  // Use the ERC-20 address from config directly — no on-chain underlyingContract() lookup needed.
  const erc20BalanceKey = ["erc20-balance", token.erc20, address];
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () =>
      sdk.signer.readContract(
        balanceOfContract(token.erc20, address as Address),
      ) as Promise<bigint>,
    enabled: !!address && isHoodi,
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
    },
    onSuccess: refreshBalances,
  });

  // Clear stale mint state when the wallet account changes so the BalancesCard
  // does not show a pending/success/error badge belonging to the previous account.
  // mint.reset is stable across renders (TanStack Query guarantee).
  useEffect(() => {
    mint.reset();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // and until the wallet is on the Hoodi network.
  const actionsDisabled = !isHoodi || !cTokenMetadata.data || !erc20Metadata.data;

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <div className="app-container connect-screen">
        <h1>Hoodi Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on Hoodi testnet.
        </p>
        <button className="btn btn-primary" onClick={connect} disabled={isConnecting}>
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
        <button className="btn btn-primary" onClick={handleSwitchToHoodi} disabled={isSwitching}>
          {isSwitching ? "Switching…" : "Switch to Hoodi"}
        </button>
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
        isLoadingConfidential={balance.handleQuery.isLoading || balance.isLoading}
        erc20Symbol={erc20Symbol}
        onMint={() => mint.mutate()}
        isMinting={mint.isPending}
        mintDisabled={actionsDisabled}
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

      <hr className="divider" />

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
      <hr className="divider" />

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        disabled={!isHoodi}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        disabled={!isHoodi}
      />

      {/* ── Delegation — delegate perspective ────────────────────────────────
          This card is used by the wallet that RECEIVED a delegation.
          Decrypt another wallet's confidential balance on their behalf. */}
      <hr className="divider" />

      <DecryptAsCard
        key={`decrypt-as-${address}-${selectedToken}`}
        tokenAddress={token.confidential}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={!isHoodi || !cTokenMetadata.data}
        connectedAddress={address as Address}
      />
    </div>
  );
}
