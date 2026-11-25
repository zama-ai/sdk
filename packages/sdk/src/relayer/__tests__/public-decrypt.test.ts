import { describe, expect, test, vi } from "vitest";
import { DecryptionFailedError } from "../../errors";
import { decryptPublicUint } from "../public-decrypt";

const handle = `0x${"ab".repeat(32)}` as const;

function relayerReturning(clearValues: unknown[]) {
  return {
    decryptPublicValuesWithSignatures: vi
      .fn()
      .mockResolvedValue({
        clearValues,
        checkSignaturesArgs: {
          handlesList: [handle],
          abiEncodedCleartexts: "0x",
          decryptionProof: "0xproof",
        },
      }),
  };
}

describe("decryptPublicUint", () => {
  test("returns the uint and its proof", async () => {
    const relayer = relayerReturning([{ type: "uint64", value: 500n }]);
    await expect(
      decryptPublicUint(relayer, handle, { operation: "finalize-unwrap" }),
    ).resolves.toEqual({ value: 500n, decryptionProof: "0xproof" });
    expect(relayer.decryptPublicValuesWithSignatures).toHaveBeenCalledWith({
      encryptedValues: [handle],
      options: { operation: "finalize-unwrap" },
    });
  });

  test.for([
    ["no value", []],
    ["a boolean", [{ type: "bool", value: true }]],
  ] as const)("refuses %s", async ([, clearValues]) => {
    await expect(
      decryptPublicUint(relayerReturning([...clearValues]), handle, {
        operation: "finalize-unwrap",
      }),
    ).rejects.toBeInstanceOf(DecryptionFailedError);
  });
});
