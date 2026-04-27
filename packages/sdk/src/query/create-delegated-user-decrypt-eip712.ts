import type { Address, Hex } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
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
  EIP712TypedData
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
