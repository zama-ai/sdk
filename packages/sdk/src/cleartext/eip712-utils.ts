/**
 * Shared EIP-712 utilities for cleartext signing operations.
 *
 * @module
 */

import { getBytes, AbiCoder, keccak256, concat, toUtf8Bytes, type Signature } from "ethers";

export const abiCoder = AbiCoder.defaultAbiCoder();

export const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

/**
 * Build an EIP-712 domain separator.
 *
 * @param name - The signing domain name (e.g. "Decryption", "InputVerification")
 * @param chainId - Chain ID for the domain
 * @param verifyingContract - Address of the verifying contract
 */
export function buildDomainSeparator(
  name: string,
  chainId: number,
  verifyingContract: string,
): string {
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes("1")),
        chainId,
        verifyingContract,
      ],
    ),
  );
}

/**
 * Compute a full EIP-712 digest from a domain separator and struct hash.
 */
export function eip712Digest(domainSeparator: string, structHash: string): string {
  return keccak256(concat(["0x1901", domainSeparator, structHash]));
}

/**
 * Pack a signature as r[32] + s[32] + v[1] (65 bytes).
 */
export function packSignature(sig: Signature): Uint8Array {
  const sigBytes = new Uint8Array(65);
  sigBytes.set(getBytes(sig.r), 0);
  sigBytes.set(getBytes(sig.s), 32);
  sigBytes[64] = sig.v;
  return sigBytes;
}
