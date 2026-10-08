import { describe, expect, test, vi } from "vitest";
import type { Address, EIP712TypedData, Hex } from "@zama-fhe/sdk";
import type { Config } from "wagmi";

const VERIFYING_CONTRACT = "0x2222222222222222222222222222222222222222" as Address;

const { ACCOUNT, mockSignTypedData } = vi.hoisted(() => ({
  ACCOUNT: "0x1111111111111111111111111111111111111111" as Address,
  mockSignTypedData: vi.fn().mockResolvedValue("0xsignature" as Hex),
}));

vi.mock(import("wagmi/actions"), () => ({
  getConnection: vi.fn().mockReturnValue({ status: "connected", address: ACCOUNT, chainId: 1 }),
  watchConnection: vi.fn().mockReturnValue(() => {}),
  signTypedData: mockSignTypedData,
  writeContract: vi.fn(),
}));

// Imported after the hoisted mocks so the module picks up the stubbed actions.
import { WagmiSigner } from "../wagmi-signer";

const TYPED_DATA: EIP712TypedData = {
  domain: { name: "Decryption", version: "1", chainId: 1n, verifyingContract: VERIFYING_CONTRACT },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    UserDecryptRequestVerification: [
      { name: "contractAddresses", type: "address[]" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
    ],
  },
  primaryType: "UserDecryptRequestVerification",
  message: { contractAddresses: [VERIFYING_CONTRACT], startTimestamp: 1000n, durationDays: "1" },
};

describe("WagmiSigner.signTypedData", () => {
  test("hands wagmi a payload a hijacked BigInt.prototype.toJSON cannot corrupt", async () => {
    const bigintPrototype = BigInt.prototype as { toJSON?: () => string };
    const originalToJSON = bigintPrototype.toJSON;
    bigintPrototype.toJSON = function (this: bigint) {
      return `${this}n`;
    };
    try {
      const signer = new WagmiSigner({ config: {} as unknown as Config });
      await expect(signer.signTypedData(TYPED_DATA)).resolves.toBe("0xsignature");

      const [, params] = mockSignTypedData.mock.calls[0]!;
      expect(JSON.stringify(params)).not.toMatch(/\d+n"/);
      expect(params).toMatchObject({
        primaryType: "UserDecryptRequestVerification",
        domain: { ...TYPED_DATA.domain, chainId: 1 },
        message: { ...TYPED_DATA.message, startTimestamp: "1000" },
      });
      expect(params.types).not.toHaveProperty("EIP712Domain");
    } finally {
      if (originalToJSON) {
        bigintPrototype.toJSON = originalToJSON;
      } else {
        delete bigintPrototype.toJSON;
      }
    }
  });
});
