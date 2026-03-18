import type { KmsDelegatedUserDecryptEIP712Type } from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link createDelegatedUserDecryptEIP712MutationOptions}. */
export interface CreateDelegatedUserDecryptEIP712Params {
  publicKey: Hex;
  contractAddresses: Address[];
  delegatorAddress: Address;
  startTimestamp: number;
  durationDays?: number;
}

export function createDelegatedUserDecryptEIP712MutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.createDelegatedUserDecryptEIP712"],
  CreateDelegatedUserDecryptEIP712Params,
  KmsDelegatedUserDecryptEIP712Type
> {
  return {
    mutationKey: ["zama.createDelegatedUserDecryptEIP712"],
    mutationFn: async ({
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    }) =>
      sdk.relayer.createDelegatedUserDecryptEIP712(
        publicKey,
        contractAddresses,
        delegatorAddress,
        startTimestamp,
        durationDays,
      ),
  };
}
