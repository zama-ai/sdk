import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { TokenValidityCache } from "../../src/registry/token-validity-cache.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";
import { confidentialTransferFromOperation } from "../../src/registry/operations/confidential-transfer-from.js";
import { confidentialTransferAndCallOperation } from "../../src/registry/operations/confidential-transfer-and-call.js";
import { confidentialTransferFromAndCallOperation } from "../../src/registry/operations/confidential-transfer-from-and-call.js";
import { unwrapOperation } from "../../src/registry/operations/unwrap.js";
import { finalizeUnwrapOperation } from "../../src/registry/operations/finalize-unwrap.js";
import { maybeRewriteTransaction } from "../../src/zama/rewriter.js";
import { createLogger } from "../../src/logging/logger.js";

const CHAIN_ID = 11155111;
const TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as const;
const FROM = "0x2222222222222222222222222222222222222222" as const;
const TO = "0x1111111111111111111111111111111111111111" as const;
const HOLDER = "0x3333333333333333333333333333333333333333" as const;
const ENCRYPTED_VALUE =
  "0xdeadbeef00000000000000000000000000000000000000000000000000000000" as const;
const INPUT_PROOF = "0xcafebabe" as const;
const UNWRAP_REQUEST_ID =
  "0xabababababababababababababababababababababababababababababababab" as const;
const DECRYPTION_PROOF = "0xd3c2c1" as const;

const logger = createLogger({ quiet: true, verbose: false });

function fakeSdk(): ZamaSDK {
  return {
    encrypt: vi
      .fn()
      .mockResolvedValue({ encryptedValues: [ENCRYPTED_VALUE], inputProof: INPUT_PROOF }),
    decryption: {
      decryptPublicValues: vi
        .fn()
        .mockResolvedValue({
          clearValues: { [UNWRAP_REQUEST_ID]: 12_000000n },
          decryptionProof: DECRYPTION_PROOF,
        }),
    },
    registry: { isConfidentialTokenValid: vi.fn().mockResolvedValue(true) },
  } as unknown as ZamaSDK;
}

describe("registered operations don't collide on selector", () => {
  it("each operation gets a distinct entry the registry can match independently", () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID }),
      confidentialTransferFromOperation({ chainId: CHAIN_ID }),
      confidentialTransferAndCallOperation({ chainId: CHAIN_ID }),
      confidentialTransferFromAndCallOperation({ chainId: CHAIN_ID }),
      unwrapOperation({ chainId: CHAIN_ID }),
      finalizeUnwrapOperation({ chainId: CHAIN_ID }),
    ]);

    expect(registry.list()).toHaveLength(6);

    const transferData = encodeFunctionData({
      abi: confidentialTransferOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "transfer",
      args: [TO, 1n],
    });
    const transferFromData = encodeFunctionData({
      abi: confidentialTransferFromOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "transferFrom",
      args: [HOLDER, TO, 1n],
    });
    const unwrapData = encodeFunctionData({
      abi: unwrapOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "unwrap",
      args: [HOLDER, TO, 1n],
    });
    const finalizeUnwrapData = encodeFunctionData({
      abi: finalizeUnwrapOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "finalizeUnwrap",
      args: [UNWRAP_REQUEST_ID],
    });

    expect(registry.find(CHAIN_ID, transferData)?.name).toContain("confidentialTransfer (");
    expect(registry.find(CHAIN_ID, transferFromData)?.name).toContain("confidentialTransferFrom");
    expect(registry.find(CHAIN_ID, unwrapData)?.name).toContain("unwrap (");
    expect(registry.find(CHAIN_ID, finalizeUnwrapData)?.name).toContain("finalizeUnwrap");
  });
});

describe("confidentialTransferFrom", () => {
  it("rewrites transferFrom(holder, to, amount) into the real confidentialTransferFrom call", async () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferFromOperation({ chainId: CHAIN_ID }),
    ]);
    const data = encodeFunctionData({
      abi: confidentialTransferFromOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "transferFrom",
      args: [HOLDER, TO, 50n],
    });
    const sdk = fakeSdk();

    const result = await maybeRewriteTransaction({
      sdk,
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(true);
    expect(sdk.encrypt).toHaveBeenCalledWith({
      values: [{ value: 50n, type: "euint64" }],
      contractAddress: TOKEN,
      userAddress: FROM, // the operator (msg.sender), not the token holder
    });

    const realAbi = confidentialTransferFromOperation({ chainId: CHAIN_ID }).buildRealCall({
      contractAddress: TOKEN,
      publicArgs: [HOLDER, TO, 50n],
      encryptedValue: ENCRYPTED_VALUE,
      inputProof: INPUT_PROOF,
    }).abi;
    const decoded = decodeFunctionData({ abi: realAbi, data: result.data });
    expect(decoded.functionName).toBe("confidentialTransferFrom");
    expect(decoded.args?.[0]).toBe(HOLDER);
    expect(decoded.args?.[1]).toBe(TO);
  });
});

describe("confidentialTransferAndCall", () => {
  it("rewrites transferAndCall(to, amount, data) and forwards `data` unchanged", async () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferAndCallOperation({ chainId: CHAIN_ID }),
    ]);
    const opaquePayload = "0x1234abcd" as const;
    const data = encodeFunctionData({
      abi: confidentialTransferAndCallOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "transferAndCall",
      args: [TO, 7n, opaquePayload],
    });
    const sdk = fakeSdk();

    const result = await maybeRewriteTransaction({
      sdk,
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(true);
    expect(sdk.encrypt).toHaveBeenCalledWith({
      values: [{ value: 7n, type: "euint64" }],
      contractAddress: TOKEN,
      userAddress: FROM,
    });

    const realAbi = confidentialTransferAndCallOperation({ chainId: CHAIN_ID }).buildRealCall({
      contractAddress: TOKEN,
      publicArgs: [TO, 7n, opaquePayload],
      encryptedValue: ENCRYPTED_VALUE,
      inputProof: INPUT_PROOF,
    }).abi;
    const decoded = decodeFunctionData({ abi: realAbi, data: result.data });
    expect(decoded.functionName).toBe("confidentialTransferAndCall");
    expect(decoded.args?.[0]).toBe(TO);
    expect(decoded.args?.[3]).toBe(opaquePayload);
  });
});

describe("confidentialTransferFromAndCall", () => {
  it("rewrites transferFromAndCall(from, to, amount, data) and forwards `data` unchanged", async () => {
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferFromAndCallOperation({ chainId: CHAIN_ID }),
    ]);
    const opaquePayload = "0x1234abcd" as const;
    const data = encodeFunctionData({
      abi: confidentialTransferFromAndCallOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "transferFromAndCall",
      args: [HOLDER, TO, 15n, opaquePayload],
    });
    const sdk = fakeSdk();

    const result = await maybeRewriteTransaction({
      sdk,
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(true);
    expect(sdk.encrypt).toHaveBeenCalledWith({
      values: [{ value: 15n, type: "euint64" }],
      contractAddress: TOKEN,
      userAddress: FROM, // the operator (msg.sender), not the token holder
    });

    const realAbi = confidentialTransferFromAndCallOperation({ chainId: CHAIN_ID }).buildRealCall({
      contractAddress: TOKEN,
      publicArgs: [HOLDER, TO, 15n, opaquePayload],
      encryptedValue: ENCRYPTED_VALUE,
      inputProof: INPUT_PROOF,
    }).abi;
    const decoded = decodeFunctionData({ abi: realAbi, data: result.data });
    expect(decoded.functionName).toBe("confidentialTransferFromAndCall");
    expect(decoded.args?.[0]).toBe(HOLDER);
    expect(decoded.args?.[1]).toBe(TO);
    expect(decoded.args?.[4]).toBe(opaquePayload);
  });
});

describe("unwrap (phase 1)", () => {
  it("rewrites unwrap(from, to, amount) into the real unwrap request call", async () => {
    const registry = new ConfidentialOperationRegistry([unwrapOperation({ chainId: CHAIN_ID })]);
    const data = encodeFunctionData({
      abi: unwrapOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "unwrap",
      args: [HOLDER, TO, 25n],
    });
    const sdk = fakeSdk();

    const result = await maybeRewriteTransaction({
      sdk,
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { from: FROM, to: TOKEN, data },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(true);
    expect(sdk.encrypt).toHaveBeenCalledWith({
      values: [{ value: 25n, type: "euint64" }],
      contractAddress: TOKEN,
      userAddress: FROM,
    });

    const realAbi = unwrapOperation({ chainId: CHAIN_ID }).buildRealCall({
      contractAddress: TOKEN,
      publicArgs: [HOLDER, TO, 25n],
      encryptedValue: ENCRYPTED_VALUE,
      inputProof: INPUT_PROOF,
    }).abi;
    const decoded = decodeFunctionData({ abi: realAbi, data: result.data });
    expect(decoded.functionName).toBe("unwrap");
    expect(decoded.args?.[0]).toBe(HOLDER);
    expect(decoded.args?.[1]).toBe(TO);
  });
});

describe("finalizeUnwrap (phase 2, decrypt-kind)", () => {
  it("publicly decrypts the request id and rewrites into the real finalizeUnwrap call — no 'from' required", async () => {
    const registry = new ConfidentialOperationRegistry([
      finalizeUnwrapOperation({ chainId: CHAIN_ID }),
    ]);
    const data = encodeFunctionData({
      abi: finalizeUnwrapOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "finalizeUnwrap",
      args: [UNWRAP_REQUEST_ID],
    });
    const sdk = fakeSdk();

    // No `from` at all — public decryption needs no signer/ACL binding.
    const result = await maybeRewriteTransaction({
      sdk,
      registry,
      tokenValidityCache: new TokenValidityCache(),
      chainId: CHAIN_ID,
      tx: { to: TOKEN, data },
      logger,
      method: "eth_sendTransaction",
    });

    expect(result.rewritten).toBe(true);
    expect(sdk.decryption.decryptPublicValues).toHaveBeenCalledWith([UNWRAP_REQUEST_ID]);

    const realAbi = finalizeUnwrapOperation({ chainId: CHAIN_ID }).buildRealCall({
      contractAddress: TOKEN,
      publicArgs: [UNWRAP_REQUEST_ID],
      clearValues: { [UNWRAP_REQUEST_ID]: 12_000000n },
      decryptionProof: DECRYPTION_PROOF,
    }).abi;
    const decoded = decodeFunctionData({ abi: realAbi, data: result.data });
    expect(decoded.functionName).toBe("finalizeUnwrap");
    expect(decoded.args?.[0]).toBe(UNWRAP_REQUEST_ID);
    expect(decoded.args?.[1]).toBe(12_000000n);
    expect(decoded.args?.[2]).toBe(DECRYPTION_PROOF);
  });

  it("propagates a clear retryable error when the KMS decryption isn't ready yet", async () => {
    const registry = new ConfidentialOperationRegistry([
      finalizeUnwrapOperation({ chainId: CHAIN_ID }),
    ]);
    const data = encodeFunctionData({
      abi: finalizeUnwrapOperation({ chainId: CHAIN_ID }).publicAbi,
      functionName: "finalizeUnwrap",
      args: [UNWRAP_REQUEST_ID],
    });
    const sdk = fakeSdk();
    sdk.decryption.decryptPublicValues = vi.fn().mockRejectedValue(new Error("not ready"));

    await expect(
      maybeRewriteTransaction({
        sdk,
        registry,
        tokenValidityCache: new TokenValidityCache(),
        chainId: CHAIN_ID,
        tx: { to: TOKEN, data },
        logger,
        method: "eth_sendTransaction",
      }),
    ).rejects.toThrow("not ready");
  });
});
