import { ethers } from "ethers";
import { FHE_BIT_WIDTHS, FheType, HANDLE_VERSION, PREHANDLE_MASK } from "./constants";

const RAW_CT_HASH_DOMAIN_SEPARATOR = ethers.toUtf8Bytes("ZK-w_rct");
const HANDLE_HASH_DOMAIN_SEPARATOR = ethers.toUtf8Bytes("ZK-w_hdl");

function cleartextToBytes(cleartext: bigint, fheType: FheType): Uint8Array {
  const byteLength = Math.ceil(FHE_BIT_WIDTHS[fheType] / 8);
  return ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(cleartext), byteLength));
}

export function computeMockCiphertext(
  fheType: FheType,
  cleartext: bigint,
  random32: Uint8Array,
): string {
  if (random32.length !== 32) {
    throw new Error("random32 must be exactly 32 bytes");
  }

  const clearBytes = cleartextToBytes(cleartext, fheType);
  const inner = ethers.keccak256(ethers.concat([new Uint8Array([fheType]), clearBytes, random32]));

  return ethers.keccak256(ethers.concat([RAW_CT_HASH_DOMAIN_SEPARATOR, ethers.getBytes(inner)]));
}

export function computeInputHandle(
  mockCiphertext: string,
  index: number,
  fheType: FheType,
  aclAddress: string,
  chainId: bigint,
): string {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    throw new Error("index must be an integer between 0 and 255");
  }

  const blobHash = ethers.keccak256(
    ethers.concat([RAW_CT_HASH_DOMAIN_SEPARATOR, ethers.getBytes(mockCiphertext)]),
  );
  const handleHash = ethers.solidityPackedKeccak256(
    ["bytes", "bytes32", "uint8", "address", "uint256"],
    [HANDLE_HASH_DOMAIN_SEPARATOR, blobHash, index, aclAddress, chainId],
  );

  const chainId64 = chainId & 0xffff_ffff_ffff_ffffn;
  const handle =
    (BigInt(handleHash) & PREHANDLE_MASK) |
    (BigInt(index) << 80n) |
    (chainId64 << 16n) |
    (BigInt(fheType) << 8n) |
    BigInt(HANDLE_VERSION);

  return ethers.toBeHex(handle, 32);
}
