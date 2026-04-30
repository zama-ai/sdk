import type { WalletClient } from "viem";
import { describe, expect, it, vi } from "../test-fixtures";
import { SignerRequiredError } from "../errors";
import { ViemSigner } from "../viem/viem-signer";

describe("ViemSigner", () => {
  // Same no-account invariant applied to each method that needs an account —
  // parametrized so failures name the offending method.
  it.each([
    ["getAddress", (s: ViemSigner) => s.getAddress()],
    [
      "signTypedData",
      (s: ViemSigner) => s.signTypedData({} as Parameters<ViemSigner["signTypedData"]>[0]),
    ],
    [
      "writeContract",
      (s: ViemSigner) => s.writeContract({} as Parameters<ViemSigner["writeContract"]>[0]),
    ],
  ] as const)("%s throws SignerRequiredError when no account is configured", async (_, call) => {
    const signer = new ViemSigner({
      walletClient: {
        getChainId: vi.fn().mockResolvedValue(31337),
      } as unknown as WalletClient,
    });

    await expect(call(signer)).rejects.toBeInstanceOf(SignerRequiredError);
  });
});
