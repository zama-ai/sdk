import type { ClearValueType } from "@zama-fhe/relayer-sdk/bundle";
import type { Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

/** A handle to decrypt, paired with its originating contract address. */
export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/** Variables for {@link userDecryptMutationOptions}. */
export interface UserDecryptMutationParams {
  handles: DecryptHandle[];
}

/** Progress callbacks for the decrypt flow. */
export interface UserDecryptCallbacks {
  /** Fired after credentials are ready (either from cache or freshly generated). */
  onCredentialsReady?: () => void;
  /** Fired after decryption completes. */
  onDecrypted?: (values: Record<Handle, ClearValueType>) => void;
}

export function userDecryptMutationOptions(
  sdk: ZamaSDK,
  callbacks?: UserDecryptCallbacks,
): MutationFactoryOptions<
  readonly ["zama.userDecrypt"],
  UserDecryptMutationParams,
  Record<Handle, ClearValueType>
> {
  return {
    mutationKey: ["zama.userDecrypt"] as const,
    mutationFn: async ({ handles }) => {
      const contractAddresses = [...new Set(handles.map((h) => h.contractAddress))];
      const creds = await sdk.credentials.allow(...contractAddresses);
      callbacks?.onCredentialsReady?.();

      const signerAddress = await sdk.signer.getAddress();
      const allResults: Record<Handle, ClearValueType> = {};

      const handlesByContract = new Map<Address, Handle[]>();
      for (const h of handles) {
        const list = handlesByContract.get(h.contractAddress) ?? [];
        list.push(h.handle);
        handlesByContract.set(h.contractAddress, list);
      }

      for (const [contractAddress, contractHandles] of handlesByContract) {
        const result = await sdk.relayer.userDecrypt({
          handles: contractHandles,
          contractAddress,
          signedContractAddresses: creds.contractAddresses,
          privateKey: creds.privateKey,
          publicKey: creds.publicKey,
          signature: creds.signature,
          signerAddress,
          startTimestamp: creds.startTimestamp,
          durationDays: creds.durationDays,
        });
        Object.assign(allResults, result);
      }

      callbacks?.onDecrypted?.(allResults);
      return allResults;
    },
    onSuccess: (data, _variables, _onMutateResult, context) => {
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        context.client.setQueryData(zamaQueryKeys.decryption.handle(handle), value);
      }
    },
  };
}
