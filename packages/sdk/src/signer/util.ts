import { isHex, type Hex } from "viem";
import { SigningFailedError } from "../errors";

/**
 * Validates that a broker/HSM/custodian returned a proper 0x-prefixed hex
 * signature; throws {@link SigningFailedError} otherwise. Surfaces
 * broker-side bugs early so a downstream RPC doesn't reject with an opaque
 * "invalid signed transaction" — or worse, the JSON-RPC layer turning
 * `undefined` into `null` and the user seeing a generic network error.
 *
 * Use this when subclassing {@link BaseSigner} to wrap an external custodian
 * client whose signing API is loosely typed.
 *
 * @example
 * ```ts
 * class MyCustodianSigner extends BaseSigner implements GenericSigner {
 *   async signTransaction(unsignedTx: Hex): Promise<Hex> {
 *     const raw = await this.custodianClient.sign(unsignedTx);
 *     return ensureHexSignature(raw, "signTransaction");
 *   }
 * }
 * ```
 */
export function ensureHexSignature(value: unknown, method: string): Hex {
  if (!isHex(value)) {
    throw new SigningFailedError(
      `Signer.${method} returned a malformed signature (expected 0x-prefixed hex, got ${typeof value}).`,
    );
  }
  return value;
}
