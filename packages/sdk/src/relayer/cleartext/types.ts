import type { Address } from "../../utils/address";
import type { Hex } from "../../utils/hex";
import type { EIP1193Provider } from "../../types/ethereum";

export interface CleartextConfig {
  chainId: number;
  network: EIP1193Provider | string;
  gatewayChainId: number;
  aclContractAddress: Address;
  executorAddress: Address;
  registryAddress?: Address;
  /** Address of the Decryption contract on the gateway chain. */
  verifyingContractAddressDecryption: Address;
  /** Address of the InputVerification contract on the gateway chain. */
  verifyingContractAddressInputVerification: Address;
  /** Private key of the KMS signer used for EIP-712 verification of the decryption. */
  kmsSignerPrivateKey?: Hex;
  /** Private key of the input signer used for EIP-712 verification of the input verification. */
  inputSignerPrivateKey?: Hex;
}
