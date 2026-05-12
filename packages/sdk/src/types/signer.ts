import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractAbi,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "./contract";

/** Snapshot of the connected wallet account at a point in time. */
export interface WalletAccount {
  address: Address;
  chainId: number;
}

/** A wallet account transition emitted by signer adapters. */
export interface WalletAccountChange {
  previous?: WalletAccount;
  next?: WalletAccount;
}

/** Listener for wallet account transitions. */
export type WalletAccountListener = (change: WalletAccountChange) => void;

/**
 * Synchronous observable store for wallet account readiness.
 *
 * Direct subscriptions observe raw signer adapter transitions. For SDK-
 * coordinated cleanup and React query invalidation, subscribe through
 * `ZamaSDK.onWalletAccountChange` so credential/cache cleanup runs first.
 */
export interface WalletAccountStore {
  /** Synchronous, non-prompting snapshot of the currently connected wallet account. */
  getSnapshot(): WalletAccount | undefined;
  /**
   * Whether the store has received at least one snapshot. Adapters whose
   * initial account is only available asynchronously start unready; callers
   * can distinguish "still loading" from "wallet not connected".
   */
  isReady(): boolean;
  /**
   * Subscribe to wallet account transitions (connect, disconnect, account
   * change, chain change). Returns an unsubscribe function.
   *
   * If a wallet account is already known when `subscribe` is called, the
   * listener MUST be invoked synchronously with
   * `{ previous: undefined, next: <current> }`. The SDK relies on this to
   * warm credentials for already-connected signers; custom stores that skip
   * this initial emit will silently break credential pre-warming.
   */
  subscribe(onWalletAccountChange: WalletAccountListener): () => void;
}

/**
 * Common shape every signer must satisfy: wallet account observability,
 * `requireWalletAccount`, and `signTypedData`. The capability methods
 * (`writeContract` / `signTransaction`) are added on top via
 * {@link GenericSigner} so the type can enforce "at least one capability".
 *
 * Internal adapters extend {@link BaseSigner} (which implements this); third
 * parties typically don't need to name this type directly.
 *
 * @internal
 */
export interface SignerCore {
  /** Observable wallet account readiness state. */
  readonly walletAccount: WalletAccountStore;
  /**
   * Return the currently connected wallet account or throw
   * {@link WalletNotConnectedError}. Must not initiate wallet connection.
   */
  requireWalletAccount(operation: string): WalletAccount;
  /**
   * Optional non-prompting account discovery hook for adapters whose initial
   * account snapshot is only available asynchronously.
   */
  refreshWalletAccount?(): Promise<WalletAccount | undefined>;
  /** Sign EIP-712 typed data (used for decrypt authorization). */
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  /** Release adapter-owned wallet watchers or provider event listeners. */
  dispose?(): void;
}

/** Atomic write capability: sign + broadcast in one wallet round-trip. */
type WriteContractCapability = {
  writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  /** Deferred capability MAY also be present on atomic signers. */
  signTransaction?(unsignedTx: Hex): Promise<Hex>;
};

/** Deferred capability: produce signed bytes for an SDK-built unsigned tx. */
type SignTransactionCapability = {
  /** Atomic capability MAY also be present on deferred signers. */
  writeContract?<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  signTransaction(unsignedTx: Hex): Promise<Hex>;
};

/**
 * Framework-agnostic signer — wallet authority as a capability bag.
 *
 * **Capabilities.** A signer declares which transaction-emitting strategies
 * it supports:
 *
 * - `writeContract` — atomic. Sign and broadcast in one wallet round-trip
 *   (browser wallets, embedded wallets in non-policy mode, server-side EOAs).
 * - `signTransaction` — deferred. Return signed bytes for an SDK-built
 *   unsigned transaction; the SDK broadcasts via
 *   {@link GenericProvider.sendRawTransaction}. Used by institutional custody
 *   (Dfns, Fireblocks, Fordefi, Turnkey policy mode).
 *
 * The type enforces "at least one capability" — a literal with neither
 * method fails to assign. A signer may implement both; atomic call sites
 * use `writeContract`, the deferred `prepare* / sign / broadcast` pipeline
 * uses `signTransaction`. The SDK does not currently route between them
 * automatically.
 *
 * Calling an atomic op on a signer that only exposes `signTransaction`
 * throws {@link SignerCapabilityError}; route through the deferred
 * `prepare* / complete*` surface instead.
 */
export type GenericSigner = SignerCore & (WriteContractCapability | SignTransactionCapability);
