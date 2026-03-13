import { concat, encodePacked, keccak256, pad, toBytes, toHex, type Address, type Hex } from "viem";
import { HANDLE_VERSION, PREHANDLE_MASK } from "./constants";
import { encryptionBitsFromFheTypeId, type FheTypeId } from "./fhe-type";
import { EncryptionFailedError } from "../../token/errors";

const RAW_CT_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_rct");
const HANDLE_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_hdl");

function cleartextToBytes(cleartext: bigint, fheType: FheTypeId): Uint8Array {
  const byteLength = Math.ceil(encryptionBitsFromFheTypeId(fheType) / 8);
  return toBytes(pad(toHex(cleartext), { size: byteLength }));
}

export function computeMockCiphertext(
  fheType: FheTypeId,
  cleartext: bigint,
  random32: Uint8Array,
): Hex {
  if (random32.length !== 32) {
    throw new EncryptionFailedError("random32 must be exactly 32 bytes");
  }

  const clearBytes = cleartextToBytes(cleartext, fheType);
  const inner = keccak256(
    concat([toHex(new Uint8Array([fheType])), toHex(clearBytes), toHex(random32)]),
  );

  return keccak256(concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), inner]));
}

export function computeInputHandle(
  mockCiphertext: Hex,
  index: number,
  fheType: FheTypeId,
  aclAddress: Address,
  chainId: bigint,
): Hex {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    throw new EncryptionFailedError("index must be an integer between 0 and 255");
  }

  const blobHash = keccak256(concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), mockCiphertext]));
  const handleHash = keccak256(
    encodePacked(
      ["bytes", "bytes32", "uint8", "address", "uint256"],
      [toHex(HANDLE_HASH_DOMAIN_SEPARATOR), blobHash, index, aclAddress, chainId],
    ),
  );

  const chainId64 = chainId & 0xFFFF_FFFF_FFFF_FFFFn;
  const handle =
    (BigInt(handleHash) & PREHANDLE_MASK) |
    (BigInt(index) << 80n) |
    (chainId64 << 16n) |
    (BigInt(fheType) << 8n) |
    BigInt(HANDLE_VERSION);

  return toHex(handle, { size: 32 });
}
