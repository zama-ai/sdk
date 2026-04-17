import type { KmsUserDecryptEIP712UserArgsType } from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/**
 * Variables for {@link createEIP712MutationOptions}. Derived from
 * {@link KmsUserDecryptEIP712UserArgsType} with stricter `publicKey`/`contractAddresses`
 * typing and optional `durationDays`. `extraData` is computed internally and omitted.
 */
export type CreateEIP712Params = Pick<KmsUserDecryptEIP712UserArgsType, "startTimestamp"> & {
  publicKey: Hex;
  contractAddresses: Address[];
  durationDays?: number;
};

export function createEIP712MutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.createEIP712"], CreateEIP712Params, EIP712TypedData> {
  return {
    mutationKey: ["zama.createEIP712"],
    mutationFn: async ({ publicKey, contractAddresses, startTimestamp, durationDays }) =>
      sdk.relayer.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays),
  };
}
