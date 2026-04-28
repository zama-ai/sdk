import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractAbi,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "./contract";

/** Snapshot of wallet identity at a point in time. */
export interface SignerIdentity {
  address: Address;
  chainId: number;
}

/** An identity transition emitted by signer adapters. */
export interface SignerIdentityChange {
  previous?: SignerIdentity;
  next?: SignerIdentity;
}

/** Listener for signer identity transitions. */
export type SignerIdentityListener = (change: SignerIdentityChange) => void;

/**
 * Framework-agnostic signer interface — wallet authority only.
 *
 * Public chain reads have moved to {@link GenericProvider}. A signer is only
 * required for operations that involve a user-controlled wallet
 * (`getAddress`, `signTypedData`, `writeContract`).
 *
 * Both interfaces expose `getChainId()` — neither takes ownership of "the
 * chain" unilaterally. A wallet can legitimately switch chain mid-session
 * while the provider's RPC stays constant.
 */
export interface GenericSigner {
  /** Return the chain ID of the connected wallet. */
  getChainId(): Promise<number>;
  /** The connected wallet address. */
  getAddress(): Promise<Address>;
  /** Sign EIP-712 typed data (used for decrypt authorization). */
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  /** Send a write transaction and return the tx hash. */
  writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(
    config: WriteContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<Hex>;
  /**
   * Subscribe to wallet identity transitions (connect, disconnect, account
   * change, chain change). Returns an unsubscribe function.
   * Built-in browser adapters also emit the current connected identity when
   * subscribe is called and the wallet is already connected.
   *
   * Optional — server-side signers or custom implementations that don't
   * support lifecycle events can omit this method entirely.
   */
  subscribe?: (onIdentityChange: SignerIdentityListener) => () => void;
}
