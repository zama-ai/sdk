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

/** A map of handles to their decrypted clear-text values. */
export type DecryptResult = Record<Handle, ClearValueType>;

/** Variables for {@link userDecryptMutationOptions}. */
export interface UserDecryptMutationParams {
  handles: DecryptHandle[];
}

export interface UserDecryptOptions {
  /** Fired after credentials are ready (either from cache or freshly generated). */
  onCredentialsReady?: () => void;
  /** Fired after decryption completes. */
  onDecrypted?: (values: DecryptResult) => void;
  /**
   * Returns `true` if the handle's decrypted value is already in the query cache.
   * When provided, the mutation skips cached handles and only decrypts uncached ones.
   */
  isHandleCached?: (handle: Handle) => boolean;
}

export function userDecryptMutationOptions(
  sdk: ZamaSDK,
  options?: UserDecryptOptions,
): MutationFactoryOptions<readonly ["zama.userDecrypt"], UserDecryptMutationParams, DecryptResult> {
  return {
    mutationKey: ["zama.userDecrypt"] as const,
    mutationFn: async ({ handles }) => {
      const {
        onCredentialsReady = () => {},
        onDecrypted = () => {},
        isHandleCached,
      } = options ?? {};
      const uncached = isHandleCached ? handles.filter((h) => !isHandleCached(h.handle)) : handles;

      if (uncached.length === 0) {
        return {};
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
