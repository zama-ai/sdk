import { concat, encodePacked, keccak256, pad, toBytes, toHex } from "viem";
import { FHE_BIT_WIDTHS, FheType, HANDLE_VERSION, PREHANDLE_MASK } from "./constants";

const RAW_CT_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_rct");
const HANDLE_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_hdl");

function cleartextToBytes(cleartext: bigint, fheType: FheType): Uint8Array {
  const byteLength = Math.ceil(FHE_BIT_WIDTHS[fheType] / 8);
  return toBytes(pad(toHex(cleartext), { size: byteLength }));
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
  const inner = keccak256(
    concat([toHex(new Uint8Array([fheType])), toHex(clearBytes), toHex(random32)]),
  );

  return keccak256(concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), inner]));
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

  const blobHash = keccak256(
    concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), mockCiphertext as `0x${string}`]),
  );
  const handleHash = keccak256(
    encodePacked(
      ["bytes", "bytes32", "uint8", "address", "uint256"],
      [
        toHex(HANDLE_HASH_DOMAIN_SEPARATOR),
        blobHash as `0x${string}`,
        index,
        aclAddress as `0x${string}`,
        chainId,
      ],
    ),
  );

  const chainId64 = chainId & 0xffff_ffff_ffff_ffffn;
  const handle =
    (BigInt(handleHash) & PREHANDLE_MASK) |
    (BigInt(index) << 80n) |
    (chainId64 << 16n) |
    (BigInt(fheType) << 8n) |
    BigInt(HANDLE_VERSION);

  return toHex(handle, { size: 32 });
}
