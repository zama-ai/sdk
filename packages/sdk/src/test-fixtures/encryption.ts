import { createFhevmEncryptClient } from "@fhevm/sdk/viem";
import { createPublicClient, custom } from "viem";
import { anvil } from "../chains/configs";
import { toFhevmChain } from "../chains/to-fhevm-chain";

export function createEncryptionValidationBackend() {
  const publicClient = createPublicClient({
    transport: custom({
      request: async () => {
        throw new Error("Validation must precede network access");
      },
    }),
  });
  // Invalid inputs reject before runtime initialization or FHE key acquisition.
  return createFhevmEncryptClient({ publicClient, chain: toFhevmChain(anvil) }).encryptValues;
}
