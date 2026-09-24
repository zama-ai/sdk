import { expect, test, vi } from "vitest";
import { diagnosticsLogger } from "../src/diagnostics.js";

test("diagnostics write warn and error messages verbatim and never write data", () => {
  const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    const marker = "private-wallet-or-plaintext";
    diagnosticsLogger.warn("[zama-sdk] warning message", { error: new Error(marker) });
    diagnosticsLogger.error("[zama-sdk] error message", { result: marker });
    diagnosticsLogger.debug("[zama-sdk] debug message", { result: marker });
    diagnosticsLogger.info("[zama-sdk] info message", { result: marker });
    expect(write.mock.calls).toEqual([
      ["[zama-sdk] warning message\n"],
      ["[zama-sdk] error message\n"],
    ]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(marker);
  } finally {
    write.mockRestore();
  }
});
