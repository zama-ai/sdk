import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

/** A handle to decrypt, paired with its originating contract address. */
export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/** A map of handles to their decrypted clear-text values. */
export type DecryptResult = Record<Handle, ClearValueType>;

/** Variables for {@link userDecryptMutationOptions}. */
export interface UserDecryptMutationParams {
  handles: DecryptHandle[];
}

export interface UserDecryptOptions {
  /** Default handles used when `mutate()` is called without arguments. */
  handles?: DecryptHandle[];
  /** Fired after credentials are ready (either from cache or freshly generated). */
  onCredentialsReady?: () => void;
  /** Fired after decryption completes. */
  onDecrypted?: (values: DecryptResult) => void;
}

export function userDecryptMutationOptions(
  sdk: ZamaSDK,
  options?: UserDecryptOptions,
): MutationFactoryOptions<
  readonly ["zama.userDecrypt"],
  UserDecryptMutationParams | void,
  DecryptResult
> {
  return {
    mutationKey: ["zama.userDecrypt"] as const,
    mutationFn: async (params) => {
      const handles = params?.handles ?? options?.handles ?? [];
      const { onCredentialsReady = () => {}, onDecrypted = () => {} } = options ?? {};

      const uncached = handles.filter((h) => !sdk.cache.has(h.handle));

      if (uncached.length === 0) {
        const cached: DecryptResult = {};
        for (const h of handles) {
          const val = sdk.cache.get(h.handle);
          if (val !== undefined) {
            cached[h.handle] = val;
          }
        }
        try {
          onDecrypted(cached);
        } catch {}
        return cached;
      }

      const contractAddresses = [...new Set(uncached.map((h) => h.contractAddress))];
      const creds = await sdk.credentials.allow(...contractAddresses);
      try {
        onCredentialsReady();
      } catch {}

      const signerAddress = await sdk.signer.getAddress();
      const allResults: DecryptResult = {};

      const handlesByContract = new Map<Address, Handle[]>();
      for (const h of uncached) {
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

      // Populate the decrypt cache with freshly decrypted values.
      for (const [handle, value] of Object.entries(allResults) as [Handle, ClearValueType][]) {
        sdk.cache.set(handle, value);
      }

      try {
        onDecrypted(allResults);
      } catch {}

      return allResults;
    },
    onSuccess: (data, _variables, _onMutateResult, context) => {
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        context.client.setQueryData(zamaQueryKeys.decryption.handle(handle), value);
      }
    },
  };
}
