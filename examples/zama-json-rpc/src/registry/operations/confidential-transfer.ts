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
 * Declares an ERC-7984 confidential transfer as an auto-rewritable operation:
 * caller sends a plaintext `transfer(to, amount)`, the wrapper encrypts
 * `amount` and rewrites it into the real `confidentialTransfer(to, encryptedAmount, inputProof)`
 * call before forwarding.
 *
 * `amount` is encrypted as euint64 — matches the ERC-7984 reference tokens
 * (6-decimal stablecoin-style balances) used for this POC. A token using a
 * different FHE width would need its own operation entry.
 */
export function confidentialTransferOperation(params: {
  chainId: number;
  tokenAddress: Address;
}): ConfidentialOperation {
  const { chainId, tokenAddress } = params;

  return {
    chainId,
    address: tokenAddress,
    name: `confidentialTransfer @ ${tokenAddress}`,
    publicAbi,
    publicFunctionName: "transfer",

    extractEncryptedInput(publicArgs) {
      const [, amount] = publicArgs as [Address, bigint];
      return { value: amount, type: "euint64" };
    },

    buildRealCall({ publicArgs, encryptedValue, inputProof }) {
      const [to] = publicArgs as [Address, bigint];
      const call = confidentialTransferContract(tokenAddress, to, encryptedValue, inputProof);
      return { abi: call.abi, functionName: call.functionName, args: call.args };
    },
  };
}
