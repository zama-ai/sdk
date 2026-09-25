import { vi } from "vitest";
import { randomBytes } from "node:crypto";
import { bytesToHex } from "viem";
import { json } from "../../src/encoding.js";
import { createEncryptionValidationBackend } from "../../../sdk/src/test-fixtures/encryption.js";
import type { CreateContextRequest } from "../../src/generated/zama/sdk/v1beta1/daemon.js";
import { fixture, testServer } from "./harness.js";

type EncryptionOperation = ReturnType<typeof fixture>["relayer"]["encryptValues"];
type EncryptionResult = Awaited<ReturnType<EncryptionOperation>>;
type EncryptionContext = { scenario: string } & Pick<
  ReturnType<typeof encryptionFixture>,
  "sdk" | "encryptValues"
>;

export type Scenario =
  | ""
  | "rate-limited"
  | "fractional-retry-hint"
  | "unavailable"
  | "invalid-input"
  | "cancelled";

export function scenarioUrl(scenario: Scenario) {
  return `http://fixture.invalid/${scenario}`;
}

export function syntheticEncryption(scenario: Scenario) {
  return async function encryptValues({
    values,
    contractAddress,
    userAddress,
    options,
  }: Parameters<EncryptionOperation>[0]): ReturnType<EncryptionOperation> {
    switch (scenario) {
      case "":
        break;
      case "rate-limited":
        throw Object.assign(new Error("Encryption service busy"), { status: 429, retryAfter: 7 });
      case "fractional-retry-hint":
        throw Object.assign(new Error("Encryption retry hint is fractional"), {
          status: 429,
          retryAfter: 7.5,
        });
      case "unavailable":
        throw Object.assign(new Error("Encryption service unavailable"), {
          status: 503,
          retryAfter: 9,
        });
      case "invalid-input":
        return createEncryptionValidationBackend()({
          values,
          contractAddress,
          userAddress,
          options,
        });
      case "cancelled":
        await new Promise<void>((_, reject) => {
          const abort = () => reject(new Error("Encryption aborted"));
          if (options?.signal?.aborted) {
            abort();
          } else {
            options?.signal?.addEventListener("abort", abort, { once: true });
          }
        });
        break;
      default:
        throw new Error("unknown encryption fixture scenario");
    }
    return {
      encryptedValues: values.map(
        () => bytesToHex(randomBytes(32)) as EncryptionResult["encryptedValues"][number],
      ),
      inputProof: bytesToHex(
        Buffer.from(json({ values, contractAddress, userAddress, timeout: options?.timeout })),
      ) as EncryptionResult["inputProof"],
    } satisfies EncryptionResult;
  };
}

export function encryptionFixture(scenario: string, ...args: Parameters<typeof fixture>) {
  const result = fixture(...args);
  const encryptValues = vi
    .mocked(result.relayer.encryptValues)
    .mockImplementation(syntheticEncryption(scenario as Scenario));
  return { ...result, encryptValues };
}

function scenarioOf(request: CreateContextRequest) {
  const url = request.config?.chains[0]?.relayerUrl;
  return url === undefined ? "" : new URL(url).pathname.slice(1);
}

export async function encryptionServer() {
  const fixtures: EncryptionContext[] = [];
  const server = await testServer(async (request, signer) => {
    const scenario = scenarioOf(request);
    const { sdk, encryptValues } = encryptionFixture(scenario, signer);
    fixtures.push({ scenario, sdk, encryptValues });
    return { sdk, storageIdentities: ["encryption-fixture"] };
  });
  return { ...server, fixtures };
}
