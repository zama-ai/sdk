import type { Address } from "viem";
import {
  EncryptionFailedError,
  RelayerRequestFailedError,
  ZamaError,
  ZamaErrorCode,
} from "../../errors";
import type { EncryptParams } from "../../relayer/relayer-sdk.types";
import { describe, expect, test, vi } from "../../test-fixtures";

const ENCRYPT_PARAMS: EncryptParams = {
  values: [{ value: 100n, type: "euint64" }],
  contractAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
  userAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
};

describe("EncryptionService", () => {
  test("encrypt returns relayer result and emits start/end events", async ({
    createEncryptionService,
    relayer,
    events,
    handle,
    inputProof,
  }) => {
    const emitEvent = vi.fn();
    const service = createEncryptionService({ emitEvent });

    const result = await service.encrypt(ENCRYPT_PARAMS);

    expect(result.encryptedValues).toEqual([handle]);
    expect(result.inputProof).toBe(inputProof);
    expect(relayer.encrypt).toHaveBeenCalledWith(ENCRYPT_PARAMS);
    expect(emitEvent).toHaveBeenCalledWith(
      { type: events.EncryptStart },
      ENCRYPT_PARAMS.contractAddress,
    );
    expect(emitEvent).toHaveBeenCalledWith(
      { type: events.EncryptEnd, durationMs: expect.any(Number) },
      ENCRYPT_PARAMS.contractAddress,
    );
  });

  test("wraps non-ZamaError failures and emits EncryptError", async ({
    createEncryptionService,
    relayer,
    events,
  }) => {
    const emitEvent = vi.fn();
    const service = createEncryptionService({ emitEvent });
    vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

    await expect(service.encrypt(ENCRYPT_PARAMS)).rejects.toBeInstanceOf(EncryptionFailedError);

    expect(emitEvent).toHaveBeenCalledWith(
      {
        type: events.EncryptError,
        error: expect.objectContaining({ message: "boom" }),
        durationMs: expect.any(Number),
      },
      ENCRYPT_PARAMS.contractAddress,
    );
  });

  test("surfaces the relayer auth message and status when encryption is rejected", async ({
    createEncryptionService,
    relayer,
  }) => {
    const service = createEncryptionService({ emitEvent: vi.fn() });
    const relayerError = Object.assign(
      new Error("Input proof failed: relayer respond with HTTP code 403 Missing Zama API Key"),
      { statusCode: 403 },
    );
    vi.mocked(relayer.encrypt).mockRejectedValueOnce(relayerError);

    const caught = await service.encrypt(ENCRYPT_PARAMS).catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(RelayerRequestFailedError);
    expect((caught as RelayerRequestFailedError).statusCode).toBe(403);
    expect((caught as RelayerRequestFailedError).message).toMatch(/zama api key/i);
  });

  test("re-throws ZamaError failures as-is after emitting EncryptError", async ({
    createEncryptionService,
    relayer,
    events,
  }) => {
    const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
    const emitEvent = vi.fn();
    const service = createEncryptionService({ emitEvent });
    vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

    await expect(service.encrypt(ENCRYPT_PARAMS)).rejects.toBe(original);
    expect(emitEvent).toHaveBeenCalledWith(
      { type: events.EncryptError, error: original, durationMs: expect.any(Number) },
      ENCRYPT_PARAMS.contractAddress,
    );
  });
});
