import type { EncryptedValue } from "@zama-fhe/sdk";
import { confidentialTransferContract, finalizeUnwrapContract } from "@zama-fhe/sdk";

export function buildCalls(amount: EncryptedValue, proof: EncryptedValue) {
  const transferCall = confidentialTransferContract({ amount, inputProof: proof });
  const finalizeCall = finalizeUnwrapContract({ amount });
  return { transferCall, finalizeCall };
}

export type Adapter = (h: EncryptedValue) => EncryptedValue;
