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
} from "@zama-fhe/react-sdk";
import { balanceOfContract } from "@zama-fhe/sdk";
import type { TokenWrapperPair, TokenWrapperPairWithMetadata, Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { BalancesCard } from "@/components/BalancesCard";
import { ShieldCard } from "@/components/ShieldCard";
import { TransferCard } from "@/components/TransferCard";
import { UnshieldCard } from "@/components/UnshieldCard";
import { PendingUnshieldCard } from "@/components/PendingUnshieldCard";
import { DelegateDecryptionCard } from "@/components/DelegateDecryptionCard";
import { RevokeDelegationCard } from "@/components/RevokeDelegationCard";
import { DecryptAsCard } from "@/components/DecryptAsCard";
import { BNB_CHAIN_ID, BNB_CHAIN_ID_HEX, BNB_EXPLORER_URL, BNB_RPC_URL } from "@/lib/config";
import { getEthereumProvider } from "@/lib/ethereum";

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = ["function mint(address to, uint256 amount)"];

// useListPairs through ethers can return objects backed by ethers Result, where named
// ABI fields are non-enumerable. Read named fields first and fall back to tuple indexes.
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

// Routes native tBNB balance reads through the direct BSC Testnet RPC so polling is fast
// and independent of the injected wallet's own RPC endpoint.
const rpcProvider = new JsonRpcProvider(BNB_RPC_URL);

// Attempt to switch to BNB. If the network is unknown to the wallet (error 4902),
// prompt to add it. Errors from wallet_switchEthereumChain (including 4001 user rejection)
// are swallowed — the caller re-reads the current chainId to determine the outcome.
// Errors from wallet_addEthereumChain propagate to the caller.
async function switchToBnb(ethereum: NonNullable<ReturnType<typeof getEthereumProvider>>) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BNB_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    if ((err as { code: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BNB_CHAIN_ID_HEX,
            chainName: "BNB Smart Chain Testnet",
            nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
            rpcUrls: [BNB_RPC_URL],
            blockExplorerUrls: [BNB_EXPLORER_URL],
          },
        ],
      });
    }
  }
}

interface SelectedTokenPanelProps {
  address: Address;
  token: TokenWrapperPairWithMetadata;
  validPairs: TokenWrapperPairWithMetadata[];
  isBnb: boolean;
  ethBalanceKey: readonly unknown[];
}

function SelectedTokenPanel({
  address,
  token,
  validPairs,
  isBnb,
  ethBalanceKey,
}: SelectedTokenPanelProps) {
  const queryClient = useQueryClient();
  const sdk = useZamaSDK();

  const { data: isAllowed } = useIsAllowed({
    contractAddresses: [token.confidentialTokenAddress],
  });

  const decimals = token.confidential.decimals;
  const erc20Decimals = token.underlying.decimals;
  const confidentialSymbol = token.confidential.symbol;
  const erc20Symbol = token.underlying.symbol;

  const allowTokens = useAllow();
  function handleDecrypt() {
    if (validPairs.length === 0) return;
    allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
  }

  const erc20BalanceKey = ["erc20-balance", token.tokenAddress, address] as const;
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () => {
      const result = await sdk.provider.readContract(
        balanceOfContract(token.tokenAddress, address),
      );
      return result as bigint;
    },
    enabled: isBnb,
  });

  const refreshBalances = () => {
    queryClient.invalidateQueries({ queryKey: erc20BalanceKey });
    queryClient.invalidateQueries({ queryKey: ethBalanceKey });
    queryClient.invalidateQueries({
      queryKey: zamaQueryKeys.confidentialBalance.token(token.confidentialTokenAddress),
    });
  };

  const balance = useConfidentialBalance(
    { tokenAddress: token.confidentialTokenAddress, account: address },
    { enabled: isBnb && !!isAllowed },
  );

  const mint = useMutation({
    mutationFn: async () => {
      const signer = sdk.requireSigner("mint");
      const txHash = await signer.writeContract({
        address: token.tokenAddress,
        abi: MINT_ABI,
        functionName: "mint",
        args: [address, parseUnits("10", erc20Decimals)],
      });
      await sdk.provider.waitForTransactionReceipt(txHash);
      return txHash;
    },
    onSuccess: refreshBalances,
  });

  useEffect(() => {
    mint.reset();
    allowTokens.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, token.confidentialTokenAddress]);

  const formattedErc20 =
    erc20Balance !== undefined ? `${formatUnits(erc20Balance, erc20Decimals)} ${erc20Symbol}` : "—";
  const formattedConfidential =
    balance.data !== undefined
      ? `${formatUnits(balance.data, decimals)} ${confidentialSymbol}`
      : "—";
  const actionsDisabled = !isBnb;

  return (
    <>
      <BalancesCard
        formattedErc20={formattedErc20}
        formattedConfidential={formattedConfidential}
        isLoadingConfidential={balance.isLoading || balance.isFetching}
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
        key={`shield-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        underlyingAddress={token.tokenAddress}
        decimals={erc20Decimals}
        symbol={erc20Symbol}
        disabled={actionsDisabled}
        onSuccess={refreshBalances}
      />

      <TransferCard
        key={`transfer-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshBalances}
      />

      <UnshieldCard
        key={`unshield-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        balanceDecryptRequired={!isAllowed}
        onSuccess={refreshBalances}
      />

      <div className="section-label">Delegation — as owner</div>

      <DelegateDecryptionCard
        key={`grant-delegation-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        disabled={actionsDisabled}
      />

      <RevokeDelegationCard
        key={`revoke-delegation-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        disabled={actionsDisabled}
      />

      <div className="section-label">Delegation — as delegate</div>

      <DecryptAsCard
        key={`decrypt-as-${address}-${token.confidentialTokenAddress}`}
        tokenAddress={token.confidentialTokenAddress}
        decimals={decimals}
        symbol={confidentialSymbol}
        disabled={actionsDisabled}
        connectedAddress={address}
      />
    </>
  );
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

  // Case-insensitive: some wallets return uppercase hex.
  const isBnb = chainId?.toLowerCase() === BNB_CHAIN_ID_HEX;

  const queryClient = useQueryClient();

  // Registry address is resolved automatically from the connected chain via the
  // chain config we passed to createConfig (registryAddress: 0xc0E8B73b…).
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

  async function handleSwitchToBnb() {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    setIsSwitching(true);
    setSwitchFailed(false);
    try {
      await switchToBnb(ethereum);
    } catch (err) {
      console.error("Failed to switch to BNB:", err);
    } finally {
      const current = (await ethereum.request({ method: "eth_chainId" })) as string;
      setChainId(current);
      setIsSwitching(false);
      setSwitchFailed(current.toLowerCase() !== BNB_CHAIN_ID_HEX);
    }
  }

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
      (ethereum.request({ method: "eth_chainId" }) as Promise<string>)
        .then(setChainId)
        .catch((err) => console.error("[chainId refresh] eth_chainId failed:", err));
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
        "No Ethereum wallet found. Please install an EIP-1193 browser wallet (e.g. Trust Wallet).",
      );
      return;
    }

    setConnectError(null);
    setIsConnecting(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      await handleSwitchToBnb();
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
    queryFn: () => rpcProvider.getBalance(address!).then(formatEther),
    enabled: !!address && isBnb,
  });

  // ── Screen 0: Initializing ────────────────────────────────────────────────
  if (isInitializing) {
    return (
      <div className="app-container connect-screen">
        <h1>BNB Confidential Token Quickstart</h1>
      </div>
    );
  }

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!address) {
    return (
      <div className="app-container connect-screen">
        <h1>BNB Confidential Token Quickstart</h1>
        <p className="subtitle">
          Connect your wallet to interact with ERC-7984 tokens on the BSC Testnet (cleartext fhEVM).
        </p>
        <button type="button" className="btn btn-primary" onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {connectError && <div className="alert alert-error card-status">{connectError}</div>}
      </div>
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isBnb) {
    return (
      <div className="app-container connect-screen">
        <h1>BNB Network Required</h1>
        <p className="subtitle">
          This app only works on the BSC Testnet (chain ID {BNB_CHAIN_ID}).
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSwitchToBnb}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to BNB"}
        </button>
        {switchFailed && (
          <div className="alert alert-error card-status">
            Could not switch to BNB. Please switch manually in your wallet.
          </div>
        )}
      </div>
    );
  }

  // ── Screen 3: Connected on BNB — main UI ─────────────────────────────────
  return (
    <div className="app-container">
      <div className="app-header">
        <h1>BNB Confidential Token Quickstart</h1>
        <div className="connected-address">Connected: {address}</div>
        <div className="connected-address">
          tBNB: {ethBalance !== undefined ? Number(ethBalance).toFixed(4) : "—"}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Token</div>
        <select
          className="select"
          value={selectedTokenAddress ?? ""}
          onChange={(e) => setSelectedTokenAddress(e.target.value as Address)}
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
        <SelectedTokenPanel
          key={`${address}-${token.confidentialTokenAddress}`}
          address={address as Address}
          token={token}
          validPairs={validPairs}
          isBnb={isBnb}
          ethBalanceKey={ethBalanceKey}
        />
      )}
    </div>
  );
}
