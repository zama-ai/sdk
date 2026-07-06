import { parseAbi, type Address, type Hex } from "viem";
import type { ConfidentialOperation } from "../types.js";

/**
 * The "public-looking" surface: ERC-1363's `transferAndCall` — a
 * pre-existing, widely used standard shape (not invented for this
 * wrapper), so this reuses its real selector (`0x4000aea0`).
 */
const publicAbi = parseAbi([
  "function transferAndCall(address to, uint256 amount, bytes data) returns (bool)",
]);

/**
 * The real ERC-7984 `confidentialTransferAndCall` signature. Inlined here
 * instead of using the SDK's `confidentialTransferAndCallContract` builder:
 * that builder exists in `packages/sdk/src/contracts/confidential-wrapper.ts`
 * and is re-exported from `contracts/index.ts`, but — verified against the
 * source during this work — is **not** re-exported from the SDK's public
 * root (`@zama-fhe/sdk`), nor is there a `./contracts` subpath export. This
 * signature is fixed by `IERC7984.sol` (same standard as `confidentialTransfer`),
 * so hand-writing it here is safe, but the gap in the SDK's export surface
 * is worth fixing upstream — see WALKTHROUGH.md.
 */
const realAbi = parseAbi([
  "function confidentialTransferAndCall(address to, bytes32 encryptedAmount, bytes inputProof, bytes data) returns (bytes32)",
]);

/**
 * Declares ERC-7984's `confidentialTransferAndCall` as an auto-rewritable
 * operation — transfer-then-notify, used for deposit-into-vault-style
 * flows (see `examples/react-wagmi`'s `ConfidentialVault` demo, SDK-244).
 * `data` is opaque here too: forwarded unchanged to the real call, never
 * inspected or crafted by the wrapper.
 */
export function confidentialTransferAndCallOperation(params: {
  chainId: number;
}): ConfidentialOperation {
  const { chainId } = params;

  return {
    chainId,
    name: "confidentialTransferAndCall (ERC-7984 standard)",
    publicAbi,
    publicFunctionName: "transferAndCall",

    extractEncryptedInput(publicArgs) {
      const [, amount] = publicArgs as [Address, bigint, Hex];
      return { value: amount, type: "euint64" };
    },

    buildRealCall({ publicArgs, encryptedValue, inputProof }) {
      const [to, , data] = publicArgs as [Address, bigint, Hex];
      return {
        abi: realAbi,
        functionName: "confidentialTransferAndCall",
        args: [to, encryptedValue, inputProof, data],
      };
    },
  };
}
