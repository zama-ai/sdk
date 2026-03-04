import { describe, expect, test, vi } from "vitest";
import { createMockSigner } from "./test-helpers";
import {
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
} from "../fees";

describe("fee query options", () => {
  test("shield fee returns zero when amount is omitted", async () => {
    const signer = createMockSigner();
    const options = shieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(await options.queryFn({ queryKey: options.queryKey })).toBe(0n);
  });

  test("unshield fee reads contract when params provided", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(77n);

    const options = unshieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1111111111111111111111111111111111111111",
      amount: 12n,
      from: "0x2222222222222222222222222222222222222222",
      to: "0x3333333333333333333333333333333333333333",
    });

    expect(await options.queryFn({ queryKey: options.queryKey })).toBe(77n);
  });

  test("batch transfer fee and recipient query contracts", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(5n)
      .mockResolvedValueOnce("0x4444444444444444444444444444444444444444");

    const batchOptions = batchTransferFeeQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
    );
    const recipientOptions = feeRecipientQueryOptions(
      signer,
      "0x1111111111111111111111111111111111111111",
    );

    expect(await batchOptions.queryFn({ queryKey: batchOptions.queryKey })).toBe(5n);
    expect(await recipientOptions.queryFn({ queryKey: recipientOptions.queryKey })).toBe(
      "0x4444444444444444444444444444444444444444",
    );
  });
});
