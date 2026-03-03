import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  FHEVM_ADDRESSES,
  FHE_BIT_WIDTHS,
  FheType,
  HANDLE_VERSION,
  PREHANDLE_MASK,
} from "../constants";
import { computeInputHandle, computeMockCiphertext } from "../handle";

describe("handle", () => {
  it("computeInputHandle encodes metadata bits for index 0", () => {
    const random32 = ethers.getBytes("0x" + "11".repeat(32));
    const mockCiphertext = computeMockCiphertext(FheType.Uint8, 42n, random32);

    const handleHex = computeInputHandle(
      mockCiphertext,
      0,
      FheType.Uint8,
      FHEVM_ADDRESSES.acl,
      31_337n,
    );

    const handle = BigInt(handleHex);

    expect(handle & 0xffn).toBe(BigInt(HANDLE_VERSION));
    expect((handle >> 8n) & 0xffn).toBe(BigInt(FheType.Uint8));
    expect((handle >> 16n) & 0xffff_ffff_ffff_ffffn).toBe(31_337n);
    expect((handle >> 80n) & 0xffn).toBe(0n);

    const blobHash = ethers.keccak256(
      ethers.concat([ethers.toUtf8Bytes("ZK-w_rct"), ethers.getBytes(mockCiphertext)]),
    );
    const handleHash = ethers.solidityPackedKeccak256(
      ["bytes", "bytes32", "uint8", "address", "uint256"],
      [ethers.toUtf8Bytes("ZK-w_hdl"), blobHash, 0, FHEVM_ADDRESSES.acl, 31_337n],
    );

    expect(handle & PREHANDLE_MASK).toBe(BigInt(handleHash) & PREHANDLE_MASK);
  });

  it("computeInputHandle encodes index in byte 21", () => {
    const random32 = ethers.getBytes("0x" + "22".repeat(32));
    const mockCiphertext = computeMockCiphertext(FheType.Uint8, 99n, random32);

    const handleHex = computeInputHandle(
      mockCiphertext,
      5,
      FheType.Uint8,
      FHEVM_ADDRESSES.acl,
      31_337n,
    );

    const handle = BigInt(handleHex);
    expect((handle >> 80n) & 0xffn).toBe(5n);
  });

  it("computeMockCiphertext uses ZK-w_rct prefixed hash", () => {
    const random32 = ethers.getBytes("0x" + "33".repeat(32));
    const result = computeMockCiphertext(FheType.Uint16, 0x1234n, random32);

    const clearBytes = ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0x1234n), 2));
    const inner = ethers.keccak256(
      ethers.concat([new Uint8Array([FheType.Uint16]), clearBytes, random32]),
    );
    const expected = ethers.keccak256(
      ethers.concat([ethers.toUtf8Bytes("ZK-w_rct"), ethers.getBytes(inner)]),
    );

    expect(result).toBe(expected);
  });

  it("computeMockCiphertext uses expected cleartext byte lengths", () => {
    const random32 = ethers.getBytes("0x" + "44".repeat(32));

    const boolCiphertext = computeMockCiphertext(FheType.Bool, 1n, random32);
    const uint256Ciphertext = computeMockCiphertext(FheType.Uint256, 1n, random32);

    const boolInner = ethers.keccak256(
      ethers.concat([
        new Uint8Array([FheType.Bool]),
        ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(1n), Math.ceil(FHE_BIT_WIDTHS[FheType.Bool] / 8))),
        random32,
      ]),
    );
    const uint256Inner = ethers.keccak256(
      ethers.concat([
        new Uint8Array([FheType.Uint256]),
        ethers.getBytes(
          ethers.zeroPadValue(ethers.toBeHex(1n), Math.ceil(FHE_BIT_WIDTHS[FheType.Uint256] / 8)),
        ),
        random32,
      ]),
    );

    expect(boolCiphertext).toBe(
      ethers.keccak256(
        ethers.concat([ethers.toUtf8Bytes("ZK-w_rct"), ethers.getBytes(boolInner)]),
      ),
    );
    expect(uint256Ciphertext).toBe(
      ethers.keccak256(
        ethers.concat([ethers.toUtf8Bytes("ZK-w_rct"), ethers.getBytes(uint256Inner)]),
      ),
    );
    expect(boolCiphertext).not.toBe(uint256Ciphertext);
  });
});
