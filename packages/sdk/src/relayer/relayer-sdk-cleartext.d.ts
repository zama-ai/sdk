/**
 * Type declaration for `@zama-fhe/relayer-sdk/cleartext`.
 * This sub-path export is not yet available in the installed version of
 * `@zama-fhe/relayer-sdk` but will ship in the next release.
 */
declare module "@zama-fhe/relayer-sdk/cleartext" {
  import type { FhevmInstanceConfig } from "./relayer-sdk.types";

  export interface CleartextInstanceConfig extends Partial<FhevmInstanceConfig> {
    cleartextExecutorAddress?: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createCleartextInstance(config: CleartextInstanceConfig): Promise<any>;
}
