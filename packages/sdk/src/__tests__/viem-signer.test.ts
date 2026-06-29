import type { WalletClient } from "viem";
import { describe, expect, test, vi } from "../test-fixtures";
import { WalletNotConnectedError } from "../errors";
import { ViemSigner } from "../viem/viem-signer";

describe("ViemSigner", () => {
  // Same no-account invariant applied to each method that needs an account —
  // parametrized so failures name the offending method.
  test.each([
    ["requireWalletAccount", (s: ViemSigner) => s.requireWalletAccount("test")],
    [
      "signTypedData",
      (s: ViemSigner) => s.signTypedData({} as Parameters<ViemSigner["signTypedData"]>[0]),
    ],
    [
      "writeContract",
      (s: ViemSigner) => s.writeContract({} as Parameters<ViemSigner["writeContract"]>[0]),
    ],
  ] as const)(
    "%s throws WalletNotConnectedError when no account is configured",
    async (_, call) => {
      const signer = new ViemSigner({
        walletClient: { getChainId: vi.fn().mockResolvedValue(31337) } as unknown as WalletClient,
      });

      await expect(
        Promise.resolve().then(() => call(signer) as unknown as Promise<unknown>),
      ).rejects.toBeInstanceOf(WalletNotConnectedError);
    },
  );
});
