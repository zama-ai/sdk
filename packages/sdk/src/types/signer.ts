import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractAbi,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "./contract";

/** Callbacks for signer lifecycle events (wallet disconnect, account switch). */
export interface SignerLifecycleCallbacks {
  /** Called when the wallet disconnects. */
  onDisconnect?: () => void;
  /** Called when the active account changes. */
  onAccountChange?: (newAddress: Address) => void;
  /** Called when the connected chain changes. */
  onChainChange?: (newChainId: number) => void;
}

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
   * Subscribe to wallet lifecycle events (disconnect, account change, chain change).
   * Returns an unsubscribe function.
   *
   * Optional — server-side signers or custom implementations that don't
   * support lifecycle events can omit this method entirely.
   */
  subscribe?: (callbacks: SignerLifecycleCallbacks) => () => void;
}
