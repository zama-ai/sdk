// Balance and read operations
export {
  ZERO_HANDLE,
  isZeroHandle,
  readConfidentialBalanceOf,
  confidentialBalanceOf,
  decryptBalance,
  balanceOf,
  decryptHandles,
  isConfidential,
  isWrapper,
  name,
  symbol,
  decimals,
  underlyingToken,
  allowance,
  discoverWrapper,
} from "./balance";

// Transfer operations
export { confidentialTransfer, confidentialTransferFrom } from "./transfer";

// Shield/unshield operations
export {
  shield,
  shieldETH,
  unwrap,
  unwrapAll,
  finalizeUnwrap,
  unshield,
  unshieldAll,
  resumeUnshield,
} from "./shield";

// Approval operations
export { approve, isApproved, approveUnderlying } from "./approve";
