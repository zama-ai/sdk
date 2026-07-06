import { parseAbi, type Hex } from "viem";
import { finalizeUnwrapContract } from "@zama-fhe/sdk";
import type { DecryptOperation } from "../types.js";

/**
 * The "public-looking" surface: a single `unwrapRequestId`, already
 * cleartext (it's just a lookup key, produced by phase 1's `unwrap` call).
 * Everything else needed for the real call is fetched by the wrapper, not
 * supplied by the caller — see below.
 */
const publicAbi = parseAbi(["function finalizeUnwrap(bytes32 unwrapRequestId) returns (bool)"]);

/**
 * Declares **phase 2** of ERC-7984's two-phase unwrap: completes a pending
 * unwrap request by fetching its public decryption proof and rebuilding the
 * real `finalizeUnwrap(unwrapRequestId, unwrapAmountCleartext,
 * decryptionProof)` call.
 *
 * This is a `"decrypt"`-kind operation, not `"encrypt"`: `unwrapRequestId`
 * doubles as the ciphertext handle for the pending amount. This was a
 * genuine risk worth checking rather than assuming (the reference
 * implementation also exposes a separate `unwrapAmount(unwrapRequestId)`
 * getter, which could have meant a lookup was needed) — verified against
 * `ERC7984ERC20Wrapper.sol` (openzeppelin-confidential-contracts, vendored
 * under `contracts/lib/forge-fhevm/dependencies/`): `unwrapRequestId` is
 * assigned as `euint64.unwrap(unwrapAmount_)` at request time, and
 * `unwrapAmount(id)` is defined as `euint64.wrap(id)` — a pure, bit-identical
 * type cast in both directions, not a separate stored value. So the two
 * really are the same handle. `sdk.decryption.decryptPublicValues()`
 * publicly discloses it — the ERC-7984 protocol's own design (see
 * `UnwrapFinalized`/`FHE.checkSignatures` in the same contract), not
 * something this wrapper invents — and needs no signer, same no-custody
 * property as `sdk.encrypt()`. If the KMS hasn't finished the decryption
 * yet, the call fails and the caller just retries later; no polling loop
 * needed here.
 */
export function finalizeUnwrapOperation(params: { chainId: number }): DecryptOperation {
  const { chainId } = params;

  return {
    kind: "decrypt",
    chainId,
    name: "finalizeUnwrap (ERC-7984 standard, phase 2/2 — completes unwrap)",
    publicAbi,
    publicFunctionName: "finalizeUnwrap",

    extractHandlesToDecrypt(publicArgs) {
      const [unwrapRequestId] = publicArgs as [Hex];
      return [unwrapRequestId];
    },

    buildRealCall({ contractAddress, publicArgs, clearValues, decryptionProof }) {
      const [unwrapRequestId] = publicArgs as [Hex];
      const clearValue = clearValues[unwrapRequestId];
      if (typeof clearValue !== "bigint") {
        throw new Error(
          `finalizeUnwrap: expected a bigint clear value for request ${unwrapRequestId}, got ${typeof clearValue}`,
        );
      }
      const call = finalizeUnwrapContract(
        contractAddress,
        unwrapRequestId,
        clearValue,
        decryptionProof,
      );
      return { abi: call.abi, functionName: call.functionName, args: call.args };
    },
  };
}
