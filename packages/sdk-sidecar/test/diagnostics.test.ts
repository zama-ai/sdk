import { expect, test, vi } from "vitest";
import { diagnosticsLogger } from "../src/diagnostics.js";

test("default diagnostics preserve the fixed runtime warning and omit arbitrary messages/data", () => {
  const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    const secret = "private-wallet-or-plaintext";
    diagnosticsLogger.warn(secret, { error: new Error(secret) });
    diagnosticsLogger.error(secret, { result: secret });
    diagnosticsLogger.debug(secret);
    diagnosticsLogger.info(secret);
    diagnosticsLogger.warn(
      "[zama-sdk] runtime configuration is already set and cannot be changed.",
    );
    expect(write.mock.calls).toEqual([
      ["[zama-sdk] warning (details omitted)\n"],
      ["[zama-sdk] error (details omitted)\n"],
      ["[zama-sdk] runtime configuration is already set and cannot be changed.\n"],
    ]);
  } finally {
    write.mockRestore();
  }
});
