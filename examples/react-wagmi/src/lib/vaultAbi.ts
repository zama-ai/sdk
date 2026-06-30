import { parseAbi } from "viem";

// Minimal ABI for the example ConfidentialVault (contracts/src/ConfidentialVault.sol).
// euint64 handles are bytes32 on the wire; `sharesOf` returns the caller-decryptable
// handle for an account's vault balance.
export const VAULT_ABI = parseAbi([
  "function sharesOf(address account) view returns (bytes32)",
  "function withdraw()",
]);
