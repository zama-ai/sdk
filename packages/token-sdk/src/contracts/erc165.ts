import { ERC165_ABI } from "../abi/erc165.abi";
import type { Address } from "../relayer/relayer-sdk.types";
import { assertAddress } from "../utils";

/** ERC-165 interface ID for IERC7984 (confidential fungible token). */
export const ERC7984_INTERFACE_ID = "0x4958f2a4" as const;

/** ERC-165 interface ID for IERC7984ERC20Wrapper (confidential wrapper). */
export const ERC7984_WRAPPER_INTERFACE_ID = "0xd04584ba" as const;

/**
 * Returns the contract config for an ERC-165 `supportsInterface` check.
 *
 * Use with {@link ERC7984_INTERFACE_ID} to detect confidential tokens,
 * or {@link ERC7984_WRAPPER_INTERFACE_ID} to detect wrappers.
 *
 * @example
 * ```ts
 * const isConfidential = await signer.readContract(
 *   supportsInterfaceContract(tokenAddress, ERC7984_INTERFACE_ID),
 * );
 * ```
 */
export function supportsInterfaceContract(tokenAddress: Address, interfaceId: Address) {
  assertAddress(tokenAddress, "tokenAddress");
  return {
    address: tokenAddress,
    abi: ERC165_ABI,
    functionName: "supportsInterface",
    args: [interfaceId],
  } as const;
}

/**
 * Returns contract config to check if a token implements IERC7984 (confidential fungible token).
 *
 * @example
 * ```ts
 * const isConfidential = await signer.readContract(
 *   isConfidentialTokenContract("0xTokenAddress"),
 * );
 * ```
 */
export function isConfidentialTokenContract(tokenAddress: Address) {
  return supportsInterfaceContract(tokenAddress, ERC7984_INTERFACE_ID);
}

/**
 * Returns contract config to check if a token implements IERC7984ERC20Wrapper (confidential wrapper).
 *
 * @example
 * ```ts
 * const isWrapper = await signer.readContract(
 *   isConfidentialWrapperContract("0xWrapperAddress"),
 * );
 * ```
 */
export function isConfidentialWrapperContract(tokenAddress: Address) {
  return supportsInterfaceContract(tokenAddress, ERC7984_WRAPPER_INTERFACE_ID);
}
