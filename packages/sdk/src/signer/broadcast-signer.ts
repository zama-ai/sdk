import { isHex, type Hex } from "viem";
import { SigningFailedError } from "../errors";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type { Broadcaster, WalletAccount } from "../types";
import { BaseSigner } from "./base-signer";

/** Configuration for {@link BroadcastSigner}. */
export interface BroadcastSignerConfig {
  /**
   * The static wallet account this signer represents. Custodial / HSM /
   * policy-engine signers do not expose a live `accountsChanged` stream the
   * way EIP-1193 wallets do, so the account is fixed at construction time.
   */
  account: WalletAccount;
  /**
   * Cross-process signing surface — typically an SDK wrapper around the
   * custodian's HTTP API (Dfns, Fireblocks, Fordefi, Turnkey policy mode) or
   * any other broker that returns signed bytes for SDK-built unsigned
   * transactions and EIP-712 payloads.
   */
  broadcaster: Broadcaster;
}

/**
 * Capability-bag signer for institutional custody and policy-engine flows.
 *
 * Exposes `signTypedData` (for FHE credential permits and other EIP-712
 * payloads) and `signTransaction` (for SDK-built unsigned transactions),
 * delegating both to the configured {@link Broadcaster}. Does NOT implement
 * `writeContract` — atomic call sites throw {@link SignerCapabilityError};
 * route through the deferred `prepare* / complete*` surface instead.
 *
 * Keys never enter the SDK: the broadcaster owns the signing material,
 * `BroadcastSigner` is a thin translation layer that puts it behind the
 * standard {@link GenericSigner} surface.
 *
 * @example
 * ```ts
 * const signer = new BroadcastSigner({
 *   account: { address: "0x0000000000000000000000000000000000000001", chainId: 1 },
 *   broadcaster: {
 *     signTransaction: (unsignedTx) => dfnsClient.signTransaction(unsignedTx),
 *     signTypedData: (typedData) => dfnsClient.signTypedData(typedData),
 *   },
 * });
 * const sdk = new ZamaSDK(createConfig({ chains, relayer, provider, signer }));
 * ```
 */
export class BroadcastSigner extends BaseSigner {
  readonly #broadcaster: Broadcaster;

  constructor(config: BroadcastSignerConfig) {
    super(config.account);
    this.#broadcaster = config.broadcaster;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signature = await this.#broadcaster.signTypedData(typedData);
    return ensureHexSignature(signature, "signTypedData");
  }

  async signTransaction(unsignedTx: Hex): Promise<Hex> {
    const signedTx = await this.#broadcaster.signTransaction(unsignedTx);
    return ensureHexSignature(signedTx, "signTransaction");
  }
}

function ensureHexSignature(value: unknown, method: string): Hex {
  // Surface broadcaster-side bugs early so a downstream RPC doesn't reject
  // with an opaque "invalid signed transaction" or, worse, the JSON-RPC
  // layer turns `undefined` into `null` and the user sees a network error.
  if (!isHex(value)) {
    throw new SigningFailedError(
      `Broadcaster.${method} returned a malformed signature (expected 0x-prefixed hex, got ${typeof value}).`,
    );
  }
  return value;
}
