import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";
import { maybeRewriteTransaction } from "../../src/zama/rewriter.js";
import { InvalidRewriteRequestError } from "../../src/zama/errors.js";
import { createLogger } from "../../src/logging/logger.js";

const CHAIN_ID = 11155111;
const TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const FROM = "0x2222222222222222222222222222222222222222" as const;
const TO = "0x1111111111111111111111111111111111111111" as const;

const registry = new ConfidentialOperationRegistry([
  confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
]);
const logger = createLogger({ quiet: true, verbose: false });

function fakeSdk(encrypt: ZamaSDK["encrypt"]): ZamaSDK {
  return { encrypt } as unknown as ZamaSDK;
}

describe("maybeRewriteTransaction", () => {
  it("passes through unchanged when the target isn't registered", async () => {
    const encrypt = vi.fn();
    const result = await maybeRewriteTransaction({
      sdk: fakeSdk(encrypt),
      registry,
      chainId: CHAIN_ID,
      tx: { from: FROM, to: "0x0000000000000000000000000000000000dEaD", data: "0x12345678" },
      logger,
    });

    expect(result.rewritten).toBe(false);
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("passes through unchanged when there is no calldata", async () => {
    const encrypt = vi.fn();
    const result = await maybeRewriteTransaction({
      sdk: fakeSdk(encrypt),
      registry,
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN },
      logger,
    });

    expect(result.rewritten).toBe(false);
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("encrypts the amount and rewrites calldata into a real confidentialTransfer call", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 42n],
    });

    const encrypt = vi
      .fn()
      .mockResolvedValue({
        encryptedValues: ["0xdeadbeef00000000000000000000000000000000000000000000000000000000"],
        inputProof: "0xcafebabe",
      });

    const result = await maybeRewriteTransaction({
      sdk: fakeSdk(encrypt),
      registry,
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data: plaintextData },
      logger,
    });

    expect(result.rewritten).toBe(true);
    expect(encrypt).toHaveBeenCalledWith({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress: TOKEN,
      userAddress: FROM,
    });

    const decoded = decodeFunctionData({
      abi: operation.buildRealCall({
        publicArgs: [TO, 42n],
        encryptedValue: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        inputProof: "0xcafebabe",
      }).abi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("confidentialTransfer");
    expect(decoded.args?.[0]).toBe(TO);
  });

  it("throws InvalidRewriteRequestError when 'from' is missing on a matched call", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 42n],
    });

    await expect(
      maybeRewriteTransaction({
        sdk: fakeSdk(vi.fn()),
        registry,
        chainId: CHAIN_ID,
        tx: { to: TOKEN, data: plaintextData },
        logger,
      }),
    ).rejects.toBeInstanceOf(InvalidRewriteRequestError);
  });
});
