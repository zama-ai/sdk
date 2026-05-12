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
export interface CoreSigner {
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

/**
 * Online signer: signs and broadcasts a write transaction in a single
 * wallet round-trip via `writeContract`. Browser wallets, embedded wallets
 * in non-policy mode, and server-side EOAs (viem / ethers / wagmi adapters)
 * fall in this group. `signTransaction` MAY also be present for hybrid use.
 */
export interface OnlineSigner extends CoreSigner {
  writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  signTransaction?(unsignedTx: Hex): Promise<Hex>;
}

/**
 * Offline signer: returns signed bytes for an SDK-built unsigned
 * transaction via `signTransaction`; the SDK broadcasts via
 * {@link GenericProvider.sendRawTransaction}. Institutional custody
 * (Dfns, Fireblocks, Fordefi, Turnkey policy mode) and HSM-backed signers
 * fall in this group. `writeContract` MAY also be present for hybrid use.
 */
export interface OfflineSigner extends CoreSigner {
  writeContract?<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  signTransaction(unsignedTx: Hex): Promise<Hex>;
}

/**
 * Framework-agnostic signer — either an {@link OnlineSigner} (writeContract)
 * or an {@link OfflineSigner} (signTransaction). The type enforces "at least
 * one capability" — a literal with neither method fails to assign. A signer
 * may satisfy both arms (hybrid).
 *
 * The SDK accepts `GenericSigner` everywhere and gates the wrong-flavour-
 * for-the-method case at runtime: atomic write methods throw
 * {@link SignerCapabilityError} when only `signTransaction` is present, and
 * vice versa for the deferred `prepare* / sign / broadcast` pipeline.
 */
export type GenericSigner = OnlineSigner | OfflineSigner;
