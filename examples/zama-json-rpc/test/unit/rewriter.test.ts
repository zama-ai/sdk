import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { TokenValidityCache } from "../../src/registry/token-validity-cache.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";
import { maybeRewriteTransaction } from "../../src/zama/rewriter.js";
import { InvalidRewriteRequestError } from "../../src/zama/errors.js";
import { createLogger } from "../../src/logging/logger.js";

const CHAIN_ID = 11155111;
const TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const NOT_A_TOKEN = "0x0000000000000000000000000000000000dEaD" as const;
const FROM = "0x2222222222222222222222222222222222222222" as const;
const TO = "0x1111111111111111111111111111111111111111" as const;

const registry = new ConfidentialOperationRegistry([
  confidentialTransferOperation({ chainId: CHAIN_ID }),
]);
const logger = createLogger({ quiet: true, verbose: false });

function fakeSdk(params: {
  encrypt?: ZamaSDK["encrypt"];
  isConfidentialTokenValid?: (address: string) => Promise<boolean>;
}): ZamaSDK {
  return {
    encrypt: params.encrypt ?? vi.fn(),
    registry: {
      isConfidentialTokenValid: params.isConfidentialTokenValid ?? vi.fn().mockResolvedValue(true),
    },
  } as unknown as ZamaSDK;
}

describe("maybeRewriteTransaction", () => {
  it("passes through unchanged when the selector isn't a known operation (no on-chain check needed)", async () => {
    const encrypt = vi.fn();
    const isConfidentialTokenValid = vi.fn();
    const result = await maybeRewriteTransaction({
      sdk: fakeSdk({ encrypt, isConfidentialTokenValid }),
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data: "0x12345678" },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(false);
    expect(encrypt).not.toHaveBeenCalled();
    expect(isConfidentialTokenValid).not.toHaveBeenCalled();
  });

  it("passes through unchanged when there is no calldata", async () => {
    const encrypt = vi.fn();
    const result = await maybeRewriteTransaction({
      sdk: fakeSdk({ encrypt }),
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(false);
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("passes through unchanged when the on-chain registry says 'to' isn't a valid confidential token", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 42n],
    });
    const encrypt = vi.fn();
    const isConfidentialTokenValid = vi.fn().mockResolvedValue(false);

    const result = await maybeRewriteTransaction({
      sdk: fakeSdk({ encrypt, isConfidentialTokenValid }),
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: NOT_A_TOKEN, data: plaintextData },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(false);
    expect(isConfidentialTokenValid).toHaveBeenCalledWith(NOT_A_TOKEN);
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("fails closed (rejects, does not guess) when the registry lookup itself errors", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 42n],
    });
    const isConfidentialTokenValid = vi.fn().mockRejectedValue(new Error("RPC timeout"));

    await expect(
      maybeRewriteTransaction({
        sdk: fakeSdk({ isConfidentialTokenValid }),
        registry,
        tokenValidityCache: new TokenValidityCache(),
        chainId: CHAIN_ID,
        tx: { from: FROM, to: TOKEN, data: plaintextData },
        logger,
        method: "eth_sendTransaction",
      }),
    ).rejects.toBeInstanceOf(InvalidRewriteRequestError);
  });

  it("encrypts the amount and rewrites calldata into a real confidentialTransfer call", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID });
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
      sdk: fakeSdk({ encrypt }),
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data: plaintextData },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(true);
    expect(encrypt).toHaveBeenCalledWith({
      values: [{ value: 42n, type: "euint64" }],
      contractAddress: TOKEN,
      userAddress: FROM,
    });

    const decoded = decodeFunctionData({
      abi: operation.buildRealCall({
        contractAddress: TOKEN,
        publicArgs: [TO, 42n],
        encryptedValue: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        inputProof: "0xcafebabe",
      }).abi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("confidentialTransfer");
    expect(decoded.args?.[0]).toBe(TO);
  });

  it("throws InvalidRewriteRequestError when 'from' is missing on a matched call to a valid token", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 42n],
    });

    await expect(
      maybeRewriteTransaction({
        sdk: fakeSdk({}),
        registry,
        tokenValidityCache: new TokenValidityCache(),
        chainId: CHAIN_ID,
        tx: { to: TOKEN, data: plaintextData },
        logger,
        method: "eth_sendTransaction",
      }),
    ).rejects.toBeInstanceOf(InvalidRewriteRequestError);
  });

  it("rejects an amount that doesn't fit euint64, rather than letting it silently truncate", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID });
    const tooLarge = 2n ** 64n; // exactly one past euint64's max
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, tooLarge],
    });
    const encrypt = vi.fn();

    await expect(
      maybeRewriteTransaction({
        sdk: fakeSdk({ encrypt }),
        registry,
        tokenValidityCache: new TokenValidityCache(),
        chainId: CHAIN_ID,
        tx: { from: FROM, to: TOKEN, data: plaintextData },
        logger,
        method: "eth_sendTransaction",
      }),
    ).rejects.toBeInstanceOf(InvalidRewriteRequestError);
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("audits and rethrows when sdk.encrypt() fails, rather than silently dropping the request", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 42n],
    });
    const encrypt = vi.fn().mockRejectedValue(new Error("relayer unreachable"));
    const auditSpy = vi.spyOn(logger, "audit");

    await expect(
      maybeRewriteTransaction({
        sdk: fakeSdk({ encrypt }),
        registry,
        tokenValidityCache: new TokenValidityCache(),
        chainId: CHAIN_ID,
        tx: { from: FROM, to: TOKEN, data: plaintextData },
        logger,
        method: "eth_sendTransaction",
      }),
    ).rejects.toThrow("relayer unreachable");

    expect(auditSpy).toHaveBeenCalledWith({
      decision: "rejected",
      method: "eth_sendTransaction",
      reason: "encrypt failed",
    });
    auditSpy.mockRestore();
  });

  it("rejects malformed calldata that matches the selector but fails to decode, with a clear error", async () => {
    // Real transfer(address,uint256) selector, but truncated/garbage body —
    // decodeFunctionData should throw; the rewriter must turn that into a
    // clear InvalidRewriteRequestError, not an opaque generic failure.
    const malformedData = "0xa9059cbb1234" as const;

    await expect(
      maybeRewriteTransaction({
        sdk: fakeSdk({}),
        registry,
        tokenValidityCache: new TokenValidityCache(),
        chainId: CHAIN_ID,
        tx: { from: FROM, to: TOKEN, data: malformedData },
        logger,
        method: "eth_sendTransaction",
      }),
    ).rejects.toBeInstanceOf(InvalidRewriteRequestError);
  });
});
