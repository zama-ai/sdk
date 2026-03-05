/**
 * Cleartext backend for `@zama-fhe/sdk` — development and testing without
 * WASM, FHE infrastructure, or the `@zama-fhe/relayer-sdk` dependency.
 *
 * Instead of real FHE encryption, plaintext values are stored on-chain via
 * the `CleartextFHEVMExecutor` contract. Handles are derived deterministically
 * so that the same inputs always produce the same handles.
 *
 * ## Quick Start
 *
 * **High-level (with RelayerCleartext):**
 * ```ts
 * import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
 *
 * // Single transport (recommended for local dev):
 * const relayer = new RelayerCleartext(HardhatConfig);
 *
 * // Multi-transport (dynamic chain switching):
 * const signer = new EthersSigner({ ethereum: window.ethereum! })
 * const relayer = new RelayerCleartext({
 *   getChainId: () => signer.getChaindId(),
 *   transports: { [HardhatConfig.chainId]: HardhatConfig, [HoodiConfig.chainId]: HoodiConfig },
 * });
 * ```
 *
 * **Low-level (with createCleartextInstance):**
 * ```ts
 * import { createCleartextInstance, CleartextExecutor } from "@zama-fhe/sdk/cleartext";
 * import { HardhatConfig } from "@zama-fhe/sdk/relayer";
 *
 * const instance = await createCleartextInstance(HardhatConfig);
 * const input = instance.createEncryptedInput(contractAddr, userAddr);
 * input.addBool(true).add64(42n);
 * const { handles, inputProof } = await input.encrypt();
 * ```
 *
 * @packageDocumentation
 */

/** High-level cleartext adapter implementing the {@link RelayerSDK} interface. */
export { RelayerCleartext } from "../relayer/relayer-cleartext";
export type {
  RelayerCleartextConfig,
  RelayerCleartextMultiConfig,
} from "../relayer/relayer-cleartext";

/** Low-level cleartext instance factory — mirrors the production FhevmInstance API. */
export { createCleartextInstance } from "./cleartext-instance";

/** On-chain plaintext reader for the CleartextFHEVMExecutor contract. */
export { CleartextExecutor } from "./cleartext-executor";

/** Configuration type for cleartext instances. */
export type { CleartextInstanceConfig } from "./types";

/** FHE type enum and deployment constants. */
export { FheType, FHE_BIT_WIDTHS, GATEWAY_CHAIN_ID } from "./constants";

/** Pre-built EIP-712 type definitions. */
export {
  INPUT_VERIFICATION_EIP712,
  KMS_DECRYPTION_EIP712,
  USER_DECRYPT_EIP712,
  DELEGATED_USER_DECRYPT_EIP712,
} from "./eip712";
