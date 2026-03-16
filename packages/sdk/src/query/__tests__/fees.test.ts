import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import {
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
} from "../fees";

describe("fee query options", () => {
  test("shield fee query is disabled when feeManagerAddress is undefined", ({ signer }) => {
    const options = shieldFeeQueryOptions(signer, {
      feeManagerAddress: undefined as unknown as `0x${string}`,
    });

    expect(options.enabled).toBe(false);
  });

  test("unshield fee query is disabled when feeManagerAddress is undefined", ({ signer }) => {
    const options = unshieldFeeQueryOptions(signer, {
      feeManagerAddress: undefined as unknown as `0x${string}`,
    });

    expect(options.enabled).toBe(false);
  });

  test("batch transfer fee query is disabled when feeManagerAddress is undefined", ({ signer }) => {
    const options = batchTransferFeeQueryOptions(signer, undefined as unknown as `0x${string}`);

    expect(options.enabled).toBe(false);
  });

  test("fee recipient query is disabled when feeManagerAddress is undefined", ({ signer }) => {
    const options = feeRecipientQueryOptions(signer, undefined as unknown as `0x${string}`);

    expect(options.enabled).toBe(false);
  });

  test("fee queries are enabled by default when feeManagerAddress is defined", ({ signer }) => {
    const feeManagerAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a";

    const shieldOptions = shieldFeeQueryOptions(signer, {
      feeManagerAddress,
      amount: 1n,
      from: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      to: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    const unshieldOptions = unshieldFeeQueryOptions(signer, {
      feeManagerAddress,
      amount: 1n,
      from: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      to: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });
    const batchOptions = batchTransferFeeQueryOptions(signer, feeManagerAddress);
    const recipientOptions = feeRecipientQueryOptions(signer, feeManagerAddress);

    expect(shieldOptions.enabled).toBe(true);
    expect(unshieldOptions.enabled).toBe(true);
    expect(batchOptions.enabled).toBe(true);
    expect(recipientOptions.enabled).toBe(true);
  });

  test("shield fee query is disabled when amount is omitted", ({ signer }) => {
    const options = shieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    });

    expect(options.enabled).toBe(false);
  });

  test("unshield fee query is disabled when recipient params are omitted", ({ signer }) => {
    const options = unshieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      amount: 12n,
    });

    expect(options.enabled).toBe(false);
  });

  test("unshield fee reads contract when params provided", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(77n);

    const options = unshieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      amount: 12n,
      from: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      to: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    expect(await options.queryFn(mockQueryContext(options.queryKey))).toBe(77n);
  });

  test("shield fee reads contract for a zero amount", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(5n);

    const options = shieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      amount: 0n,
      from: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      to: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    expect(await options.queryFn(mockQueryContext(options.queryKey))).toBe(5n);
    expect(signer.readContract).toHaveBeenCalledOnce();
  });

  test("batch transfer fee and recipient query contracts", async ({ signer }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(5n)
      .mockResolvedValueOnce("0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D");

    const batchOptions = batchTransferFeeQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );
    const recipientOptions = feeRecipientQueryOptions(
      signer,
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );

    expect(await batchOptions.queryFn(mockQueryContext(batchOptions.queryKey))).toBe(5n);
    expect(await recipientOptions.queryFn(mockQueryContext(recipientOptions.queryKey))).toBe(
      "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D",
    );
  });

  test("shield fee queryFn throws explicit invariant errors from context.queryKey", async ({
    signer,
  }) => {
    const options = shieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      amount: 1n,
      from: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      to: "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C",
    });

    await expect(
      options.queryFn(mockQueryContext(["zama.fees", { type: "shield" }] as const)),
    ).rejects.toThrow("feeManagerAddress is required");
  });
});
