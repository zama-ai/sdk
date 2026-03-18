import { decryptionKeys } from "../decryption-cache";

describe(decryptionKeys, () => {
  it("produces stable query keys", () => {
    const key = decryptionKeys.value("0xhandle1");
    expect(key).toEqual(["zama.decryption", { handle: "0xhandle1" }]);
  });

  it("supports contract-scoped query keys", () => {
    const key = decryptionKeys.value("0xhandle1", "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
    expect(key).toEqual([
      "zama.decryption",
      {
        handle: "0xhandle1",
        contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      },
    ]);
  });
});
