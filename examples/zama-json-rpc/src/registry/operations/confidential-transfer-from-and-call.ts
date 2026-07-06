import { parseAbi, type Address, type Hex } from "viem";
import type { EncryptOperation } from "../types.js";

/**
 * The "public-looking" surface: ERC-1363's `transferFromAndCall` (the
 * 4-arg overload with `data`) — a pre-existing, real standard selector,
 * same rationale as `confidential-transfer-and-call.ts`. Verified against
 * `IERC1363.sol` (vendored under
 * `contracts/lib/forge-fhevm/dependencies/.../lib/openzeppelin-contracts/`):
 * `function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);`
 */
const publicAbi = parseAbi([
  "function transferFromAndCall(address from, address to, uint256 amount, bytes data) returns (bool)",
]);

/**
 * The real ERC-7984 `confidentialTransferFromAndCall` signature — verified
 * against `IERC7984.sol` (same vendored path). Inlined for the same reason
 * as `confidentialTransferAndCall`: not re-exported from the SDK's public
 * root (see `confidential-transfer-and-call.ts`).
 */
const realAbi = parseAbi([
  "function confidentialTransferFromAndCall(address from, address to, bytes32 encryptedAmount, bytes inputProof, bytes data) returns (bytes32)",
]);

/**
 * Declares ERC-7984's `confidentialTransferFromAndCall` as an auto-rewritable
 * operation — the operator-initiated counterpart to
 * `confidentialTransferAndCall`, combining `confidentialTransferFrom`'s
 * on-behalf-of semantics (`msg.sender` must be an approved operator for
 * `from`, enforced on-chain) with a post-transfer callback to `to`. Found
 * during a review pass over `IERC7984.sol` — not in the original operation
 * set. `data` is opaque here too, same as `confidentialTransferAndCall`.
 */
export function confidentialTransferFromAndCallOperation(params: {
  chainId: number;
}): EncryptOperation {
  const { chainId } = params;

  return {
    kind: "encrypt",
    chainId,
    name: "confidentialTransferFromAndCall (ERC-7984 standard)",
    publicAbi,
    publicFunctionName: "transferFromAndCall",

    extractEncryptedInput(publicArgs) {
      const [, , amount] = publicArgs as [Address, Address, bigint, Hex];
      return { value: amount, type: "euint64" };
    },

    buildRealCall({ publicArgs, encryptedValue, inputProof }) {
      const [from, to, , data] = publicArgs as [Address, Address, bigint, Hex];
      return {
        abi: realAbi,
        functionName: "confidentialTransferFromAndCall",
        args: [from, to, encryptedValue, inputProof, data],
      };
    },
  };
}
