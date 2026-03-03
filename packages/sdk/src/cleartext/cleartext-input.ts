import { getAddress, getBytes } from "ethers";
import { computeCleartextHandles } from "./cleartext-handles";

/** Fluent builder for cleartext encrypted inputs. */
export interface CleartextEncryptedInput {
  addBool(value: boolean | number | bigint): CleartextEncryptedInput;
  add8(value: number | bigint): CleartextEncryptedInput;
  add16(value: number | bigint): CleartextEncryptedInput;
  add32(value: number | bigint): CleartextEncryptedInput;
  add64(value: number | bigint): CleartextEncryptedInput;
  add128(value: number | bigint): CleartextEncryptedInput;
  add256(value: number | bigint): CleartextEncryptedInput;
  addAddress(value: string): CleartextEncryptedInput;
  getBits(): number[];
  encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

function checkValue(value: number | bigint, bits: number): void {
  if (value == null) throw new Error("Missing value");
  const limit = bits >= 8 ? BigInt(`0x${"ff".repeat(bits / 8)}`) : BigInt(2 ** bits - 1);
  if (BigInt(value) > limit) {
    throw new Error(`The value exceeds the limit for ${bits}bits integer (${limit}).`);
  }
}

/**
 * Build an InputProof from handles and plaintext values.
 *
 * Layout:
 *   [byte 0]     numHandles
 *   [byte 1]     numSigners (0 in cleartext)
 *   [32*n bytes] handles
 *   [remaining]  extraData: 0x00 version + 32-byte padded plaintext per value
 */
function buildInputProof(handleHexes: string[], values: bigint[]): Uint8Array {
  const numHandles = handleHexes.length;
  const header = new Uint8Array([numHandles, 0]); // numHandles, numSigners=0
  const handlesBytes = new Uint8Array(numHandles * 32);
  for (let i = 0; i < numHandles; i++) {
    handlesBytes.set(getBytes(handleHexes[i]!), i * 32);
  }
  // extraData: version byte + 32-byte padded value per handle
  const extraData = new Uint8Array(1 + values.length * 32);
  extraData[0] = 0x00; // version
  for (let i = 0; i < values.length; i++) {
    const hex = values[i]!.toString(16).padStart(64, "0");
    const bytes = getBytes("0x" + hex);
    extraData.set(bytes, 1 + i * 32);
  }
  const result = new Uint8Array(header.length + handlesBytes.length + extraData.length);
  result.set(header, 0);
  result.set(handlesBytes, header.length);
  result.set(extraData, header.length + handlesBytes.length);
  return result;
}

export function createCleartextEncryptedInput(params: {
  aclContractAddress: string;
  chainId: number;
  contractAddress: string;
  userAddress: string;
}): CleartextEncryptedInput {
  const { aclContractAddress, chainId } = params;
  const bits: number[] = [];
  const values: bigint[] = [];

  const checkLimit = (added: number): void => {
    if (bits.reduce((acc, b) => acc + Math.max(2, b), 0) + added > 2048) {
      throw new Error("Packing more than 2048 bits in a single input ciphertext is unsupported");
    }
    if (bits.length + 1 > 256) {
      throw new Error("Packing more than 256 variables in a single input ciphertext is unsupported");
    }
  };

  const self: CleartextEncryptedInput = {
    addBool(value) {
      if (value == null) throw new Error("Missing value");
      if (Number(value) > 1) throw new Error("The value must be 0 or 1.");
      checkLimit(2);
      values.push(BigInt(Number(value)));
      bits.push(2);
      return self;
    },
    add8(value) { checkValue(value, 8); checkLimit(8); values.push(BigInt(value)); bits.push(8); return self; },
    add16(value) { checkValue(value, 16); checkLimit(16); values.push(BigInt(value)); bits.push(16); return self; },
    add32(value) { checkValue(value, 32); checkLimit(32); values.push(BigInt(value)); bits.push(32); return self; },
    add64(value) { checkValue(value, 64); checkLimit(64); values.push(BigInt(value)); bits.push(64); return self; },
    add128(value) { checkValue(value, 128); checkLimit(128); values.push(BigInt(value)); bits.push(128); return self; },
    add256(value) { checkValue(value, 256); checkLimit(256); values.push(BigInt(value)); bits.push(256); return self; },
    addAddress(value) {
      getAddress(value); // throws if not valid checksummed address
      checkLimit(160);
      values.push(BigInt(value));
      bits.push(160);
      return self;
    },
    getBits() { return [...bits]; },
    async encrypt() {
      if (bits.length === 0) throw new Error("Encrypted input must contain at least one value");
      const { handles } = computeCleartextHandles({ values, encryptionBits: bits, aclContractAddress, chainId });
      const inputProof = buildInputProof(handles, values);
      return {
        handles: handles.map((h) => getBytes(h)),
        inputProof,
      };
    },
  };

  return self;
}
