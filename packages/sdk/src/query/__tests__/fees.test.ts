import { describe, expect, test, vi } from "../../test-fixtures";
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
    const feeManagerAddress = "0x1111111111111111111111111111111111111111";

    const shieldOptions = shieldFeeQueryOptions(signer, { feeManagerAddress });
    const unshieldOptions = unshieldFeeQueryOptions(signer, { feeManagerAddress });
    const batchOptions = batchTransferFeeQueryOptions(signer, feeManagerAddress);
    const recipientOptions = feeRecipientQueryOptions(signer, feeManagerAddress);

    expect(shieldOptions.enabled).toBe(true);
    expect(unshieldOptions.enabled).toBe(true);
    expect(batchOptions.enabled).toBe(true);
    expect(recipientOptions.enabled).toBe(true);
  });

  test("shield fee returns zero when amount is omitted", async ({ signer }) => {
    const options = shieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(await options.queryFn({ queryKey: options.queryKey })).toBe(0n);
  });

  test("unshield fee reads contract when params provided", async ({ signer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(77n);

    const options = unshieldFeeQueryOptions(signer, {
      feeManagerAddress: "0x1111111111111111111111111111111111111111",
      amount: 12n,
      from: "0x2222222222222222222222222222222222222222",
      to: "0x3333333333333333333333333333333333333333",
    });

    expect(await options.queryFn({ queryKey: options.queryKey })).toBe(77n);
  });

  test("batch transfer fee and recipient query contracts", async ({ signer }) => {
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
