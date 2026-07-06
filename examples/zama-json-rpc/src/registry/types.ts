import type { Abi, Address, Hex } from "viem";
import type { EncryptInput, EncryptedValue } from "@zama-fhe/sdk";

/**
 * Declares one auto-rewritable confidential operation: a contract + a
 * "public-looking" function signature the caller is expected to invoke with
 * plaintext arguments, mapped to the real on-chain confidential call.
 *
 * This is the only extension point. Adding support for another token or
 * another operation (wrap, transferFrom, ...) means adding one more entry
 * here — nothing else in the router/rewriter changes.
 */
export interface ConfidentialOperation {
  /** Chain this entry applies to. */
  chainId: number;
  /** Contract address this operation targets. */
  address: Address;
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
   * Given the decoded plaintext args and the resulting ciphertext, build the
   * real on-chain call (real ABI, real function name, real args).
   */
  buildRealCall(params: {
    publicArgs: readonly unknown[];
    encryptedValue: EncryptedValue;
    inputProof: Hex;
  }): { abi: Abi; functionName: string; args: readonly unknown[] };
}
