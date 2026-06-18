import type { Handle } from "@zama-fhe/sdk";
import { confidentialTransferContract, finalizeUnwrapContract } from "@zama-fhe/sdk";

export function buildCalls(amount: Handle, proof: Handle) {
  const transferCall = confidentialTransferContract({ amount, inputProof: proof });
  const finalizeCall = finalizeUnwrapContract({ amount });
  return { transferCall, finalizeCall };
}

export type Adapter = (h: Handle) => Handle;
