import type { Address } from "viem";
import { erc165Abi } from "../abi/erc165.abi";

/** ERC-165 interface ID for IERC7984 (confidential fungible token). */
export const ERC7984_INTERFACE_ID = "0x4958f2a4" as const;

/** ERC-165 interface ID for IERC7984ERC20Wrapper (confidential wrapper) — current deployed baseline. */
export const ERC7984_WRAPPER_INTERFACE_ID_LEGACY = "0xf1f4c25a" as const;

/**
 * ERC-165 interface ID for IERC7984ERC20Wrapper (confidential wrapper) — upgraded interface.
 *
 * Introduced in protocol-apps commit 93c6e7a (April 2026 security upgrade).
 * During the transition period, both {@link ERC7984_WRAPPER_INTERFACE_ID_LEGACY} and this
 * constant must be checked to support old and new wrappers simultaneously.
 *
 * @see {@link ERC7984_WRAPPER_INTERFACE_ID_LEGACY} for the legacy interface ID.
 */
export const ERC7984_WRAPPER_INTERFACE_ID = "0x1f1c62b2" as const;

/**
 * Returns the contract config for an ERC-165 `supportsInterface` check.
 *
 * Use with {@link ERC7984_INTERFACE_ID} to detect confidential tokens,
 * or {@link ERC7984_WRAPPER_INTERFACE_ID_LEGACY} / {@link ERC7984_WRAPPER_INTERFACE_ID}
 * to detect wrappers (both must be checked during the transition period).
 *
 * @example
 * ```ts
 * const isConfidential = await signer.readContract(
 *   supportsInterfaceContract(tokenAddress, ERC7984_INTERFACE_ID),
 * );
 * ```
 */
export function supportsInterfaceContract(tokenAddress: Address, interfaceId: Address) {
  return {
    address: tokenAddress,
    abi: erc165Abi,
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
 * Returns contract config to check if a token implements IERC7984ERC20Wrapper (confidential wrapper)
 * using the **current deployed baseline** interface ID
 * ({@link ERC7984_WRAPPER_INTERFACE_ID_LEGACY}, `0xf1f4c25a`).
 *
 * Note: During the transition period, calling this alone is insufficient. Upgraded wrappers
 * respond only to {@link ERC7984_WRAPPER_INTERFACE_ID}. Prefer higher-level APIs
 * (`ReadonlyToken.isWrapper()`, `isWrapperQueryOptions()`) which check both interface IDs.
 *
 * @example
 * ```ts
 * const isWrapper = await signer.readContract(
 *   isConfidentialWrapperContract("0xWrapperAddress"),
 * );
 * ```
 */
export function isConfidentialWrapperContract(tokenAddress: Address) {
  return supportsInterfaceContract(tokenAddress, ERC7984_WRAPPER_INTERFACE_ID_LEGACY);
}
