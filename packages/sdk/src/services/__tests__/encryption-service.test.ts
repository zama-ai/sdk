import type { Address } from "viem";
import { EncryptionFailedError, ZamaError, ZamaErrorCode } from "../../errors";
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
    eventService,
    relayer,
    events,
  }) => {
    const onEvent = vi.fn();
    eventService.subscribe(onEvent);
    const service = createEncryptionService();

    const result = await service.encrypt(ENCRYPT_PARAMS);

    expect(result.handles).toHaveLength(1);
    expect(result.inputProof).toBeInstanceOf(Uint8Array);
    expect(relayer.encrypt).toHaveBeenCalledWith(ENCRYPT_PARAMS);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: events.EncryptStart,
        tokenAddress: ENCRYPT_PARAMS.contractAddress,
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: events.EncryptEnd,
        durationMs: expect.any(Number),
        tokenAddress: ENCRYPT_PARAMS.contractAddress,
      }),
    );
  });

  test("wraps non-ZamaError failures and emits EncryptError", async ({
    createEncryptionService,
    eventService,
    relayer,
    events,
  }) => {
    const onEvent = vi.fn();
    eventService.subscribe(onEvent);
    const service = createEncryptionService();
    vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

    await expect(service.encrypt(ENCRYPT_PARAMS)).rejects.toBeInstanceOf(EncryptionFailedError);

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: events.EncryptError,
        error: expect.objectContaining({ message: "boom" }),
        durationMs: expect.any(Number),
        tokenAddress: ENCRYPT_PARAMS.contractAddress,
      }),
    );
  });

  test("re-throws ZamaError failures as-is after emitting EncryptError", async ({
    createEncryptionService,
    eventService,
    relayer,
    events,
  }) => {
    const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
    const onEvent = vi.fn();
    eventService.subscribe(onEvent);
    const service = createEncryptionService();
    vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

    await expect(service.encrypt(ENCRYPT_PARAMS)).rejects.toBe(original);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: events.EncryptError,
        error: original,
        durationMs: expect.any(Number),
        tokenAddress: ENCRYPT_PARAMS.contractAddress,
      }),
    );
  });
});
