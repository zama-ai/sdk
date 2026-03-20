import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link createEIP712MutationOptions}. */
export interface CreateEIP712Params {
  publicKey: Hex;
  contractAddresses: Address[];
  startTimestamp: number;
  durationDays?: number;
}

export function createEIP712MutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.createEIP712"], CreateEIP712Params, EIP712TypedData> {
  return {
    mutationKey: ["zama.createEIP712"],
    mutationFn: async ({ publicKey, contractAddresses, startTimestamp, durationDays }) =>
      sdk.relayer.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays),
  };
}
