import { describe, expect, it } from "vitest";
import { encodeFunctionData } from "viem";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";

const CHAIN_ID = 11155111;
const TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const OTHER_TOKEN = "0x0000000000000000000000000000000000dEaD" as const;
const TO = "0x1111111111111111111111111111111111111111" as const;

function transferCalldata() {
  return encodeFunctionData({
    abi: confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }).publicAbi,
    functionName: "transfer",
    args: [TO, 10n],
  });
}

describe("ConfidentialOperationRegistry", () => {
  it("matches a registered chainId + address + selector", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
    ]);

    const found = registry.find(CHAIN_ID, TOKEN, transferCalldata());
    expect(found?.name).toContain(TOKEN);
  });

  it("is case-insensitive on the contract address", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
    ]);

    const found = registry.find(CHAIN_ID, TOKEN.toUpperCase() as typeof TOKEN, transferCalldata());
    expect(found).toBeDefined();
  });

  it("does not match a different contract address", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
    ]);

    expect(registry.find(CHAIN_ID, OTHER_TOKEN, transferCalldata())).toBeUndefined();
  });

  it("does not match a different chainId", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
    ]);

    expect(registry.find(1, TOKEN, transferCalldata())).toBeUndefined();
  });

  it("does not match an unregistered function selector on the same contract", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
    ]);

    const unrelatedCalldata =
      "0xa9059cbc000000000000000000000000000000000000000000000000000000000000";
    expect(registry.find(CHAIN_ID, TOKEN, unrelatedCalldata)).toBeUndefined();
  });

  it("list() returns every registered operation", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: OTHER_TOKEN }),
    ]);

    expect(registry.list()).toHaveLength(2);
  });
});
