/**
 * Viem-specific React hooks for low-level contract interactions.
 *
 * These hooks do NOT require {@link ZamaProvider} — they operate directly
 * through viem `PublicClient` and `WalletClient`.
 *
 * @packageDocumentation
 */

export {
  useConfidentialBalanceOf,
  useConfidentialBalanceOfSuspense,
  type UseConfidentialBalanceOfConfig,
  type UseConfidentialBalanceOfSuspenseConfig,
} from "./use-confidential-balance-of";
export {
  useConfidentialTransfer,
  type ConfidentialTransferParams,
} from "./use-confidential-transfer";
export {
  useConfidentialBatchTransfer,
  type ConfidentialBatchTransferParams,
} from "./use-confidential-batch-transfer";
export { useUnwrap, type UnwrapParams } from "./use-unwrap";
export { useUnwrapFromBalance, type UnwrapFromBalanceParams } from "./use-unwrap-from-balance";
export { useFinalizeUnwrap, type FinalizeUnwrapParams } from "./use-finalize-unwrap";
export { useSetOperator, type SetOperatorParams } from "./use-set-operator";
export {
  useWrapperForToken,
  useWrapperForTokenSuspense,
  type UseWrapperForZamaConfig,
  type UseWrapperForTokenSuspenseConfig,
} from "./use-wrapper-for-token";
export {
  useUnderlyingToken,
  useUnderlyingTokenSuspense,
  type UseUnderlyingZamaConfig,
  type UseUnderlyingTokenSuspenseConfig,
} from "./use-underlying-token";
export { useShield, type ShieldParams } from "./use-wrap";
export { useShieldETH, type ShieldETHParams } from "./use-wrap-eth";
export {
  useWrapperExists,
  useWrapperExistsSuspense,
  type UseWrapperExistsConfig,
  type UseWrapperExistsSuspenseConfig,
} from "./use-wrapper-exists";
export {
  useSupportsInterface,
  useSupportsInterfaceSuspense,
  type UseSupportsInterfaceConfig,
  type UseSupportsInterfaceSuspenseConfig,
} from "./use-supports-interface";
export { ViemSigner } from "./viem-signer";

// High-level token hooks (re-exported for convenience)
export {
  useUnshield,
  useUnshieldAll,
  useResumeUnshield,
  useConfidentialTransferFrom,
  useConfidentialApprove,
  useConfidentialBalance,
  useConfidentialBalances,
  useAuthorizeAll,
  useTokenMetadata,
  useActivityFeed,
  useApproveUnderlying,
  useUnwrapAll,
} from "../index";
