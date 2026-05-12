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
 * Framework-agnostic signer interface — wallet authority as a capability bag.
 *
 * Public chain reads have moved to {@link GenericProvider}. A signer is only
 * required for operations that involve a user-controlled wallet
 * (`requireWalletAccount`, `signTypedData`, plus one of `writeContract` /
 * `signTransaction`).
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
 * At least one of the two must be present for any write op to succeed. A
 * signer may implement both — atomic call sites use `writeContract`, the
 * deferred `prepare* / sign / broadcast` pipeline uses `signTransaction`;
 * the SDK does not currently route between them automatically.
 *
 * Calling an atomic op on a signer that only exposes `signTransaction`
 * throws {@link SignerCapabilityError}; route through the deferred
 * `prepare* / complete*` surface instead.
 */
export interface GenericSigner {
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
  /**
   * Sign and broadcast a write transaction in a single step, returning the
   * tx hash. Absent on broadcast-only signers (custodian / HSM / policy
   * engine) that defer broadcast to the SDK.
   */
  writeContract?<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  /**
   * Sign an SDK-built unsigned transaction and return RLP-encoded signed
   * bytes. The SDK broadcasts the result via
   * {@link GenericProvider.sendRawTransaction}. Absent on classic
   * sign-and-broadcast signers that prefer {@link writeContract}.
   */
  signTransaction?(unsignedTx: Hex): Promise<Hex>;
  /** Release adapter-owned wallet watchers or provider event listeners. */
  dispose?(): void;
}
