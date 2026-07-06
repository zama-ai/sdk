import { describe, expect, it } from "vitest";
import { encodeFunctionData } from "viem";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";

const CHAIN_ID = 11155111;
const TO = "0x1111111111111111111111111111111111111111" as const;

function transferCalldata() {
  return encodeFunctionData({
    abi: confidentialTransferOperation({ chainId: CHAIN_ID }).publicAbi,
    functionName: "transfer",
    args: [TO, 10n],
  });
}

describe("ConfidentialOperationRegistry", () => {
  it("matches a registered chainId + selector — not scoped to any contract address", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID }),
    ]);

    const found = registry.find(CHAIN_ID, transferCalldata());
    expect(found?.name).toBe("confidentialTransfer (ERC-7984 standard)");
  });

  it("does not match a different chainId", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID }),
    ]);

    expect(registry.find(1, transferCalldata())).toBeUndefined();
  });

  it("does not match an unregistered function selector", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID }),
    ]);

    const unrelatedCalldata =
      "0xa9059cbc000000000000000000000000000000000000000000000000000000000000";
    expect(registry.find(CHAIN_ID, unrelatedCalldata)).toBeUndefined();
  });

  it("list() returns every registered operation", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID }),
    ]);

    expect(registry.list()).toHaveLength(1);
  });

  it("fails fast at construction if two operations share a (chainId, selector)", () => {
    const duplicate = {
      ...confidentialTransferOperation({ chainId: CHAIN_ID }),
      name: "duplicate",
    };

    expect(
      () =>
        new ConfidentialOperationRegistry([
          confidentialTransferOperation({ chainId: CHAIN_ID }),
          duplicate,
        ]),
    ).toThrow(/share the same selector/);
  });
});
