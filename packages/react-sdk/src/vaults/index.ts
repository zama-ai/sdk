/**
 * React hooks for confidential ERC-4626 vaults.
 *
 * @packageDocumentation
 */
export { useVaultClient } from "./use-vault-client";
export { useBatch, type UseBatchOptions } from "./use-batch";
export { useOpenBatches } from "./use-open-batches";
export {
  useClaim,
  useDeposit,
  useDispatch,
  useFinalize,
  useQuit,
  useRedeem,
  type UseVaultMutationOptions,
} from "./use-mutations";
