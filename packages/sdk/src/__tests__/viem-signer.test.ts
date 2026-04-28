import type { WalletClient } from "viem";
import { describe, expect, it, vi } from "../test-fixtures";
import { SignerRequiredError } from "../errors";
import { ViemSigner } from "../viem/viem-signer";

describe("ViemSigner", () => {
  it("throws SignerRequiredError when no account is available", async () => {
    const signer = new ViemSigner({
      walletClient: {
        getChainId: vi.fn().mockResolvedValue(31337),
      } as unknown as WalletClient,
    });

    await expect(signer.getAddress()).rejects.toBeInstanceOf(SignerRequiredError);
    await expect(
      signer.signTypedData({} as Parameters<typeof signer.signTypedData>[0]),
    ).rejects.toBeInstanceOf(SignerRequiredError);
    await expect(
      signer.writeContract({} as Parameters<typeof signer.writeContract>[0]),
    ).rejects.toBeInstanceOf(SignerRequiredError);
  });
});
