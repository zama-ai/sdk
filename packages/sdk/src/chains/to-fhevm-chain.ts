import type { FhevmChain } from "@fhevm/sdk/chains";
import type { FheChain } from "./types";

/**
 * Derive an `@fhevm/sdk` {@link FhevmChain} from zama-sdk's richer
 * {@link FheChain}.
 *
 * `FheChain` carries fields `@fhevm/sdk` does not model (RPC `network`,
 * `registryAddress`, `executorAddress`, cleartext signer keys); those stay on
 * `FheChain` for the token layer. This adapter projects only the subset the
 * FHE runtime needs: contract addresses, relayer URL, and gateway.
 */
export function toFhevmChain(chain: FheChain): FhevmChain {
  return {
    id: chain.id,
    fhevm: {
      contracts: {
        acl: { address: chain.aclContractAddress },
        inputVerifier: { address: chain.inputVerifierContractAddress },
        kmsVerifier: { address: chain.kmsContractAddress },
        protocolConfig:
          chain.protocolConfigContractAddress !== undefined
            ? { address: chain.protocolConfigContractAddress }
            : undefined,
      },
      relayerUrl: chain.relayerUrl,
      gateway: {
        id: chain.gatewayChainId,
        contracts: {
          decryption: { address: chain.verifyingContractAddressDecryption },
          inputVerification: { address: chain.verifyingContractAddressInputVerification },
        },
      },
    },
  } satisfies FhevmChain;
}
