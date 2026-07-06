import { parseAbi, type Address } from "viem";
import { unwrapContract } from "@zama-fhe/sdk";
import type { ConfidentialOperation } from "../types.js";

/**
 * The "public-looking" surface for unwrap. Unlike `transfer`/`transferFrom`,
 * there's no pre-existing ERC-20/ERC-1363 standard shape for "convert
 * confidential balance back to the underlying ERC-20" — this signature is
 * invented for this wrapper (same `(address,address,uint256)` argument
 * shape as `transferFrom`, but a distinct function name, so it gets its own
 * selector and doesn't collide with the `confidentialTransferFrom` entry).
 */
const publicAbi = parseAbi([
  "function unwrap(address from, address to, uint256 amount) returns (bool)",
]);

/**
 * Declares **phase 1 only** of ERC-7984's two-phase unwrap as an
 * auto-rewritable operation: caller sends a plaintext-looking
 * `unwrap(from, to, amount)`, the wrapper encrypts `amount` and rewrites it
 * into the real `unwrap(from, to, encryptedAmount, inputProof)` call.
 *
 * This only *requests* the unwrap — the underlying ERC-20 isn't released
 * until a second, separate on-chain call, `finalizeUnwrap(unwrapRequestId,
 * unwrapAmountCleartext, decryptionProof)`, once the KMS has asynchronously
 * decrypted the amount. `finalizeUnwrap`'s parameters are already
 * cleartext — there's nothing to encrypt or hide — but obtaining
 * `decryptionProof` needs polling/tracking a pending decryption, which is
 * a different kind of feature (async operation tracking) than the
 * single-request auto-rewrite this registry does. Deliberately not
 * implemented here — see WALKTHROUGH.md.
 */
export function unwrapOperation(params: { chainId: number }): ConfidentialOperation {
  const { chainId } = params;

  return {
    chainId,
    name: "unwrap (ERC-7984 standard, phase 1/2 — request only)",
    publicAbi,
    publicFunctionName: "unwrap",

    extractEncryptedInput(publicArgs) {
      const [, , amount] = publicArgs as [Address, Address, bigint];
      return { value: amount, type: "euint64" };
    },

    buildRealCall({ contractAddress, publicArgs, encryptedValue, inputProof }) {
      const [from, to] = publicArgs as [Address, Address, bigint];
      const call = unwrapContract(contractAddress, from, to, encryptedValue, inputProof);
      return { abi: call.abi, functionName: call.functionName, args: call.args };
    },
  };
}
