import type { Eip1193Provider } from "ethers";

/**
 * Configuration for a cleartext FHEVM instance.
 *
 * Extends the standard FHEVM chain config with the address of the
 * `CleartextFHEVMExecutor` contract, which stores plaintext values
 * during development/testing instead of real FHE ciphertexts.
 *
 * Pre-built configs are available in `relayer-utils.ts`:
 * - {@link HardhatConfig} — local Hardhat node (chainId 31337)
 * - {@link HoodiConfig} — Hoodi testnet (chainId 560048)
 */
export interface CleartextInstanceConfig {
  /** JSON-RPC URL string or EIP-1193 provider (e.g. MetaMask's `window.ethereum`). */
  network: Eip1193Provider | string;
  /** Chain ID of the target network. */
  chainId: number;
  /** Chain ID of the gateway network (used for EIP-712 domain). */
  gatewayChainId: number;
  /** Address of the ACL contract (EIP-55 checksummed). */
  aclContractAddress: string;
  /** Address of the KMS contract. */
  kmsContractAddress: string;
  /** Address of the InputVerifier contract. */
  inputVerifierContractAddress: string;
  /** Address of the KMSVerifier contract used for decryption EIP-712 domains. */
  verifyingContractAddressDecryption: string;
  /** Address of the InputVerifier contract used for input verification EIP-712 domains. */
  verifyingContractAddressInputVerification: string;
  /** Address of the CleartextFHEVMExecutor contract that stores plaintext values. */
  cleartextExecutorAddress: string;
  /** Private key of the mock coprocessor signer (hex string). Required for input proof signing. */
  coprocessorSignerPrivateKey: string;
  /** Private key of the mock KMS signer (hex string). Required for decryption proof signing. */
  kmsSignerPrivateKey: string;
}
