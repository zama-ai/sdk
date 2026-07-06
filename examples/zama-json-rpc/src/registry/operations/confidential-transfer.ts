import { parseAbi, type Address } from "viem";
import { confidentialTransferContract } from "@zama-fhe/sdk";
import type { ConfidentialOperation } from "../types.js";

/**
 * The "public-looking" surface callers use: a standard ERC-20 `transfer`.
 * This is what makes the rewrite transparent — callers don't write
 * Zama-specific code, they call the same shape they'd use for any token.
 */
const publicAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

/**
 * Declares ERC-7984's `confidentialTransfer` as an auto-rewritable
 * operation: caller sends a plaintext `transfer(to, amount)`, the wrapper
 * encrypts `amount` and rewrites it into the real
 * `confidentialTransfer(to, encryptedAmount, inputProof)` call before
 * forwarding.
 *
 * Not bound to a specific token address — `IERC7984.sol` fixes this exact
 * signature (and the `euint64` amount width) for every conforming
 * confidential token, so this one entry covers all of them. Which `to`
 * addresses actually are valid confidential tokens is resolved dynamically
 * per-request (see `src/zama/rewriter.ts`), not declared here.
 */
export function confidentialTransferOperation(params: { chainId: number }): ConfidentialOperation {
  const { chainId } = params;

  return {
    chainId,
    name: "confidentialTransfer (ERC-7984 standard)",
    publicAbi,
    publicFunctionName: "transfer",

    extractEncryptedInput(publicArgs) {
      const [, amount] = publicArgs as [Address, bigint];
      return { value: amount, type: "euint64" };
    },

    buildRealCall({ contractAddress, publicArgs, encryptedValue, inputProof }) {
      const [to] = publicArgs as [Address, bigint];
      const call = confidentialTransferContract(contractAddress, to, encryptedValue, inputProof);
      return { abi: call.abi, functionName: call.functionName, args: call.args };
    },
  };
}
