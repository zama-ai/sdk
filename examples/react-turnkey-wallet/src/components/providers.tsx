"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import {
  IndexedDBStorage,
  indexedDBStorage,
  createConfig,
  type FheChain,
  type ZamaConfig,
} from "@zama-fhe/sdk";
import { ViemSigner, ViemProvider } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { AuthState, ClientState, TurnkeyProvider, useTurnkey } from "@turnkey/react-wallet-kit";
import { WalletSource, type WalletAccount } from "@turnkey/core";
import type { v1TransactionType } from "@turnkey/sdk-types";
import {
  createWalletClient,
  createPublicClient,
  http,
  isAddress,
  hashMessage,
  serializeTransaction,
  serializeTypedData,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { toAccount } from "viem/accounts";
import { serializeSignature } from "@turnkey/viem";
import { zamaConfig as zamaChainPreset, viemChain, RPC_URL } from "@/lib/config";

// Separate IndexedDB instance for permit signatures — not required for correctness
// (storage keys are namespaced internally), kept separate here for clarity between
// the two storage responsibilities.
const permitDBStorage = new IndexedDBStorage("PermitStore");

const queryClient = new QueryClient();
const turnkeyConfig = {
  organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORG_ID!,
  authProxyConfigId: process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID!,
};

function ensureHexPrefix(value: string): `0x${string}` {
  return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
}

function detectTurnkeyTransactionType(unsignedTransaction: string): v1TransactionType {
  return unsignedTransaction.startsWith("76")
    ? "TRANSACTION_TYPE_TEMPO"
    : "TRANSACTION_TYPE_ETHEREUM";
}

function signatureToHex(signature: { r: string; s: string; v: string }): `0x${string}` {
  return serializeSignature(signature, "hex") as `0x${string}`;
}

type EmbeddedEthereumAccount = WalletAccount & { address: Address; organizationId?: string };

function buildTurnkeyAccount(input: {
  walletAccount: EmbeddedEthereumAccount;
  signMessage: (params: {
    message: string;
    walletAccount: EmbeddedEthereumAccount;
    encoding?: "PAYLOAD_ENCODING_HEXADECIMAL" | "PAYLOAD_ENCODING_EIP712";
    hashFunction?: "HASH_FUNCTION_NO_OP";
    addEthereumPrefix?: boolean;
    organizationId?: string;
  }) => Promise<{ r: string; s: string; v: string }>;
  signTransaction: (params: {
    unsignedTransaction: string;
    transactionType: v1TransactionType;
    walletAccount: EmbeddedEthereumAccount;
    organizationId?: string;
  }) => Promise<string>;
}) {
  const { walletAccount, signMessage, signTransaction } = input;

  return toAccount({
    address: walletAccount.address,
    async sign({ hash }) {
      const signature = await signMessage({
        message: hash,
        walletAccount,
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_NO_OP",
        organizationId: walletAccount.organizationId,
      });
      return signatureToHex(signature);
    },
    async signMessage({ message }) {
      const signature = await signMessage({
        message: hashMessage(message),
        walletAccount,
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_NO_OP",
        organizationId: walletAccount.organizationId,
      });
      return signatureToHex(signature);
    },
    async signTransaction(transaction, options) {
      const serializer = options?.serializer ?? serializeTransaction;
      const unsignedTransaction = (await serializer(transaction)).replace(/^0x/, "");
      const signedTransaction = await signTransaction({
        unsignedTransaction,
        transactionType: detectTurnkeyTransactionType(unsignedTransaction),
        walletAccount,
        organizationId: walletAccount.organizationId,
      });
      return ensureHexPrefix(signedTransaction);
    },
    async signTypedData(typedData) {
      const signature = await signMessage({
        message: serializeTypedData(typedData),
        walletAccount,
        encoding: "PAYLOAD_ENCODING_EIP712",
        hashFunction: "HASH_FUNCTION_NO_OP",
        organizationId: walletAccount.organizationId,
      });
      return signatureToHex(signature);
    },
  });
}

type TurnkeyZamaContextValue = {
  clientState: ClientState | undefined;
  authState: AuthState;
  walletAddress: Address | null;
  publicClient: PublicClient | null;
  isSignerReady: boolean;
  initError: string | null;
  walletCreationError: string | null;
  needsWalletCreation: boolean;
  isCreatingWallet: boolean;
  handleLogin: () => Promise<void>;
  createEmbeddedWallet: () => Promise<void>;
  waitForTransactionReceipt: (hash: Hex) => Promise<unknown>;
};

const TurnkeyZamaContext = createContext<TurnkeyZamaContextValue | null>(null);

export function useTurnkeyZama() {
  const context = useContext(TurnkeyZamaContext);
  if (!context) {
    throw new Error("useTurnkeyZama must be used within Providers");
  }
  return context;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TurnkeyProvider
        config={turnkeyConfig}
        callbacks={{ onError: (error) => console.error("Turnkey error:", error) }}
      >
        <TurnkeyZamaBridge>{children}</TurnkeyZamaBridge>
      </TurnkeyProvider>
    </QueryClientProvider>
  );
}

function TurnkeyZamaBridge({ children }: { children: ReactNode }) {
  const {
    httpClient,
    wallets,
    fetchWalletAccounts,
    refreshWallets,
    createWallet,
    clientState,
    authState,
    handleLogin,
    signMessage,
    signTransaction,
  } = useTurnkey();
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [walletCreationError, setWalletCreationError] = useState<string | null>(null);
  const [needsWalletCreation, setNeedsWalletCreation] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function syncSigner() {
      function reset(opts: { needsWallet?: boolean; error?: string } = {}) {
        if (cancelled) return;
        setWalletClient(null);
        setPublicClient(null);
        setWalletAddress(null);
        setInitError(opts.error ?? null);
        setNeedsWalletCreation(opts.needsWallet ?? false);
      }

      if (clientState !== ClientState.Ready || !httpClient) {
        reset();
        return;
      }

      try {
        const availableWallets =
          wallets.length > 0
            ? wallets
            : authState === AuthState.Authenticated
              ? await refreshWallets()
              : [];

        if (availableWallets.length === 0) {
          reset({ needsWallet: true });
          return;
        }

        const embeddedWallet = availableWallets.find(
          (wallet) => wallet.source === WalletSource.Embedded,
        );

        if (!embeddedWallet) {
          reset({ needsWallet: true });
          return;
        }

        const accounts = await fetchWalletAccounts({ wallet: embeddedWallet });
        const ethAccount = accounts.find(
          (account) => account.source === WalletSource.Embedded && isAddress(account.address),
        );

        if (!ethAccount) {
          throw new Error("No embedded Ethereum account found in the selected Turnkey wallet");
        }

        const account = buildTurnkeyAccount({
          walletAccount: ethAccount as EmbeddedEthereumAccount,
          signMessage,
          signTransaction,
        });

        const nextWalletClient = createWalletClient({
          account,
          chain: viemChain,
          transport: http(RPC_URL),
        }) as WalletClient;

        const nextPublicClient = createPublicClient({ chain: viemChain, transport: http(RPC_URL) });

        if (!cancelled) {
          setWalletAddress(ethAccount.address as Address);
          setWalletClient(nextWalletClient);
          setPublicClient(nextPublicClient);
          setInitError(null);
          setNeedsWalletCreation(false);
        }
      } catch (e: unknown) {
        reset({ error: e instanceof Error ? e.message : "Failed to initialize Turnkey wallet" });
      }
    }

    void syncSigner();
    return () => {
      cancelled = true;
    };
  }, [
    clientState,
    httpClient,
    wallets,
    fetchWalletAccounts,
    refreshWallets,
    authState,
    signMessage,
    signTransaction,
  ]);

  const sdkConfig = useMemo<ZamaConfig | null>(() => {
    if (typeof window === "undefined") return null;
    if (!walletClient || !publicClient) return null;

    // `zamaChainPreset` is `sepolia | mainnet` (runtime-selected). Erase the union to
    // a generic `FheChain` so `createConfig`'s `relayers` doesn't require entries for
    // both possible chain ids.
    const chain: FheChain = {
      ...zamaChainPreset,
      relayerUrl: `${window.location.origin}/api/relayer`,
      network: RPC_URL,
    };

    return createConfig({
      chains: [chain],
      provider: new ViemProvider({ publicClient }),
      signer: new ViemSigner({ walletClient }),
      storage: indexedDBStorage,
      permitStorage: permitDBStorage,
      relayers: { [chain.id]: web() },
      onEvent: (event) => {
        // Re-dispatch SDK events on window so per-component listeners (e.g.
        // unshield-card's UnshieldPhase1Submitted handler) can react without
        // having to thread an onEvent callback through props.
        window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
      },
    });
  }, [walletClient, publicClient]);

  const login = useCallback(async () => {
    try {
      await handleLogin();
    } catch (e: unknown) {
      setInitError(e instanceof Error ? e.message : "Login failed");
    }
  }, [handleLogin]);

  const createEmbeddedWallet = useCallback(async () => {
    setIsCreatingWallet(true);
    setWalletCreationError(null);
    try {
      await createWallet({
        walletName: "Zama Confidential Tokens",
        accounts: ["ADDRESS_FORMAT_ETHEREUM"],
      });
      await refreshWallets();
      setNeedsWalletCreation(false);
    } catch (e: unknown) {
      setWalletCreationError(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setIsCreatingWallet(false);
    }
  }, [createWallet, refreshWallets]);

  const contextValue = useMemo<TurnkeyZamaContextValue>(
    () => ({
      clientState,
      authState,
      walletAddress,
      publicClient,
      isSignerReady: !!sdkConfig,
      initError,
      walletCreationError,
      needsWalletCreation,
      isCreatingWallet,
      handleLogin: login,
      createEmbeddedWallet,
      waitForTransactionReceipt: async (hash: Hex) => {
        if (!publicClient) {
          throw new Error("Wallet provider is not ready");
        }
        return publicClient.waitForTransactionReceipt({ hash });
      },
    }),
    [
      clientState,
      authState,
      walletAddress,
      publicClient,
      sdkConfig,
      initError,
      walletCreationError,
      needsWalletCreation,
      isCreatingWallet,
      login,
      createEmbeddedWallet,
    ],
  );

  const content = sdkConfig ? <ZamaProvider config={sdkConfig}>{children}</ZamaProvider> : children;

  return <TurnkeyZamaContext.Provider value={contextValue}>{content}</TurnkeyZamaContext.Provider>;
}
