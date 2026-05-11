import { describe, expect, test, vi } from "../../test-fixtures";
import { SignerNotConfiguredError } from "../../errors";

describe("AccountService", () => {
  describe("without signer", () => {
    test("requireAlignedWalletAccount throws SignerNotConfiguredError", async ({
      createAccountService,
    }) => {
      const service = createAccountService({ signer: undefined });

      await expect(service.requireAlignedWalletAccount("op")).rejects.toBeInstanceOf(
        SignerNotConfiguredError,
      );
    });

    test("onWalletAccountChange returns a working unsubscribe", ({ createAccountService }) => {
      const service = createAccountService({ signer: undefined });
      const listener = vi.fn();

      const unsubscribe = service.onWalletAccountChange(listener);
      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
