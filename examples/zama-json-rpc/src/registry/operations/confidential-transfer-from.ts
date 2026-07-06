import { parseAbi, type Address } from "viem";
import { confidentialTransferFromContract } from "@zama-fhe/sdk";
import type { EncryptOperation } from "../types.js";

/**
 * The "public-looking" surface: standard ERC-20 `transferFrom`. Same
 * transparency rationale as `confidential-transfer.ts`.
 */
const publicAbi = parseAbi([
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

/**
 * Declares ERC-7984's `confidentialTransferFrom` as an auto-rewritable
 * operation — the operator-based transfer used by custodian/relayer flows
 * that move funds on behalf of a holder. `msg.sender` (the request's
 * `from`, i.e. the operator) must already be approved via `setOperator` on
 * the real contract; that's enforced on-chain, not by this wrapper.
 *
 * `userAddress` passed to `sdk.encrypt()` is the JSON-RPC request's `from`
 * (the operator / actual on-chain caller), not the decoded logical `from`
 * (the token holder) — the FHE input proof is bound to whoever submits the
 * transaction, matching how `msg.sender` works on-chain. See
 * `src/zama/rewriter.ts`.
 */
export function confidentialTransferFromOperation(params: { chainId: number }): EncryptOperation {
  const { chainId } = params;

  return {
    kind: "encrypt",
    chainId,
    name: "confidentialTransferFrom (ERC-7984 standard)",
    publicAbi,
    publicFunctionName: "transferFrom",

    extractEncryptedInput(publicArgs) {
      const [, , amount] = publicArgs as [Address, Address, bigint];
      return { value: amount, type: "euint64" };
    },

    buildRealCall({ contractAddress, publicArgs, encryptedValue, inputProof }) {
      const [from, to] = publicArgs as [Address, Address, bigint];
      const call = confidentialTransferFromContract(
        contractAddress,
        from,
        to,
        encryptedValue,
        inputProof,
      );
      return { abi: call.abi, functionName: call.functionName, args: call.args };
    },
  };
}
