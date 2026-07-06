import type { Abi, Address, Hex } from "viem";
import type { EncryptInput, EncryptedValue } from "@zama-fhe/sdk";

/**
 * Declares one auto-rewritable confidential *operation*: a "public-looking"
 * function signature the caller is expected to invoke with plaintext
 * arguments, mapped to the real on-chain confidential call.
 *
 * Deliberately **not** scoped to one contract address. ERC-7984 fixes the
 * real function signature and the `euint64` amount width as part of the
 * standard itself (see `IERC7984.sol`) — so one operation entry covers every
 * conforming token. Whether a given `to` address is actually a genuine,
 * registered confidential token is checked dynamically at request time via
 * `sdk.registry.isConfidentialTokenValid()` (Zama's on-chain wrappers
 * registry), not via a locally configured address list — see
 * WALKTHROUGH.md for why.
 *
 * This is the only extension point for *operations* (wrap, transferFrom,
 * ...). Supporting another *token* requires no code change at all.
 */
export interface ConfidentialOperation {
  /** Chain this entry applies to. */
  chainId: number;
  /** Human-readable identifier for logs and `zama_listConfidentialOperations`. */
  name: string;
  /** The public-looking ABI fragment the caller sends plaintext calldata against. */
  publicAbi: Abi;
  /** Function name on `publicAbi` that triggers this rewrite. */
  publicFunctionName: string;
  /**
   * Given the decoded plaintext args, return the value to encrypt and its FHE type.
   * This is what gets sent to `ZamaSDK.encrypt()`.
   */
  extractEncryptedInput(publicArgs: readonly unknown[]): EncryptInput;
  /**
   * Given the confidential token address (the request's `to`), the decoded
   * plaintext args, and the resulting ciphertext, build the real on-chain
   * call (real ABI, real function name, real args).
   */
  buildRealCall(params: {
    contractAddress: Address;
    publicArgs: readonly unknown[];
    encryptedValue: EncryptedValue;
    inputProof: Hex;
  }): { abi: Abi; functionName: string; args: readonly unknown[] };
}
