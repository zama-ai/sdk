import { vi } from "vitest";
import { randomBytes } from "node:crypto";
import { bytesToHex } from "viem";
import { json } from "../../src/encoding.js";
import { createEncryptionValidationBackend } from "../../../sdk/src/test-fixtures/encryption.js";
import scenarios from "../../../../proto/fixtures/encryption-scenarios.json";
import { fixture, testServer } from "./harness.js";

type EncryptionOperation = ReturnType<typeof fixture>["relayer"]["encryptValues"];
export const encryptionScenarios = scenarios;

export async function syntheticEncryption({
  values,
  contractAddress,
  userAddress,
  options,
}: Parameters<EncryptionOperation>[0]): ReturnType<EncryptionOperation> {
  // Timeout selects synthetic behavior so every native client can share one fixture protocol.
  if (options?.timeout === encryptionScenarios.invalidInput) {
    return createEncryptionValidationBackend()({ values, contractAddress, userAddress, options });
  }
  if (options?.timeout === encryptionScenarios.rateLimited) {
    throw Object.assign(new Error("Encryption service busy"), { status: 429, retryAfter: 7 });
  }
  if (options?.timeout === encryptionScenarios.fractionalRetryHint) {
    throw Object.assign(new Error("Encryption retry hint is fractional"), {
      status: 429,
      retryAfter: 7.5,
    });
  }
  if (options?.timeout === encryptionScenarios.unavailable) {
    throw Object.assign(new Error("Encryption service unavailable"), {
      status: 503,
      retryAfter: 9,
    });
  }
  if (options?.timeout === encryptionScenarios.cancelled) {
    await new Promise<void>((_, reject) => {
      const abort = () => reject(new Error("Encryption aborted"));
      if (options.signal?.aborted) {
        abort();
      } else {
        options.signal?.addEventListener("abort", abort, { once: true });
      }
    });
  }
  return {
    encryptedValues: values.map(() => bytesToHex(randomBytes(32))),
    inputProof: bytesToHex(
      Buffer.from(json({ values, contractAddress, userAddress, timeout: options?.timeout })),
    ),
  } as unknown as Awaited<ReturnType<EncryptionOperation>>;
}

export function encryptionFixture(...args: Parameters<typeof fixture>) {
  const result = fixture(...args);
  const encryptValues = vi
    .mocked(result.relayer.encryptValues)
    .mockImplementation(syntheticEncryption);
  return { ...result, encryptValues };
}

export async function encryptionServer() {
  const fixtures: ReturnType<typeof encryptionFixture>[] = [];
  const server = await testServer(async (_, signer) => {
    const result = encryptionFixture(signer);
    fixtures.push(result);
    return { sdk: result.sdk, storageIdentities: ["encryption-fixture"] };
  });
  return { ...server, fixtures };
}
