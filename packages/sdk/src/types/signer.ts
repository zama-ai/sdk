import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/types";
import type {
  ContractAbi,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "./contract";

/** Snapshot of the connected wallet account at a point in time. */
export interface WalletAccount {
  /** Address of the connected wallet account. */
  address: Address;
  /** Chain ID the wallet is currently connected to. */
  chainId: number;
}

/** A wallet account transition emitted by signer adapters. */
export interface WalletAccountChange {
  /** Account before the transition; `undefined` if none was connected. */
  previous?: WalletAccount;
  /** Account after the transition; `undefined` on disconnect. */
  next?: WalletAccount;
}

/** Listener for wallet account transitions. */
export type WalletAccountListener = (change: WalletAccountChange) => void;

/**
 * Synchronous observable store for wallet account readiness.
 *
 * Direct subscriptions observe raw signer adapter transitions. For SDK-
 * coordinated cleanup and React query invalidation, subscribe through
 * {@link ZamaSDK.onWalletAccountChange} so credential/cache cleanup runs first.
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
 * Framework-agnostic signer. Always exposes wallet-account observability,
 * `requireWalletAccount`, and `signTypedData`. Tx-signing is offered through
 * two optional capabilities — `writeContract` (atomic sign+broadcast in one
 * wallet round-trip; browser wallets, embedded wallets, server-side EOAs)
 * and `signTransaction` (return signed bytes for the SDK to broadcast via
 * {@link GenericProvider.sendRawTransaction}; HSM-backed or in-process
 * air-gap signers). A signer may expose either, both (hybrid), or neither
 * (typed-data-only).
 *
 * The SDK gates capability mismatches at runtime via
 * {@link SignerCapabilityError}: atomic write methods throw when
 * `writeContract` is absent, and the offline `sign` path throws when
 * `signTransaction` is absent. Implementers extend {@link BaseSigner} for
 * the wallet-account / dispose boilerplate, or implement this interface
 * directly with {@link createWalletAccountStore}.
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
  /** Atomic sign-and-broadcast in one wallet round-trip. */
  writeContract?<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  /** Return signed bytes for an SDK-built unsigned transaction. */
  signTransaction?(unsignedTx: Hex): Promise<Hex>;
  /** Release adapter-owned wallet watchers or provider event listeners. */
  dispose?(): void;
}
