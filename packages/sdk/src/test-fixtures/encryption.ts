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
  // Client creation requires a KMSGeneration contract; validation never reaches it.
  const chain = toFhevmChain({
    ...anvil,
    keyVerification: { contract: "0x0000000000000000000000000000000000000001" },
  });
  return createFhevmEncryptClient({ publicClient, chain }).encryptValues;
}
