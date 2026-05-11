import type { Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";

/**
 * Cross-process signing surface for institutional custody / HSM / policy
 * engine workflows. The {@link BroadcastSigner} adapter holds one of these
 * and exposes it as a {@link GenericSigner} capability bag (without
 * `writeContract`) — the SDK builds unsigned transactions, the broadcaster
 * returns signed bytes (or signed typed-data), and the SDK broadcasts via
 * {@link GenericProvider.sendRawTransaction}.
 *
 * The broadcaster never sees plaintext private keys: it is the integration
 * boundary with Dfns, Fireblocks, Fordefi, Turnkey (policy mode), or any
 * other custody platform that exposes signing as an asynchronous, possibly
 * policy-gated request.
 *
 * Implementations may take seconds, minutes, or hours to respond (HSM
 * ceremonies, multi-party approval, spending-limit reviews). The SDK does
 * not impose a timeout; callers wrap the `prepare* / sign* / broadcast*`
 * sequence in their own deadlines if needed.
 */
export interface Broadcaster {
  /**
   * Sign an RLP-encoded unsigned transaction and return RLP-encoded signed
   * bytes. The signed bytes are forwarded to
   * {@link GenericProvider.sendRawTransaction} for inclusion.
   */
  signTransaction(unsignedTx: Hex): Promise<Hex>;
  /**
   * Sign EIP-712 typed data and return the signature. Used by FHE credential
   * permits, decrypt authorizations, and any other typed-data flow the SDK
   * routes through the deferred path.
   */
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
}
