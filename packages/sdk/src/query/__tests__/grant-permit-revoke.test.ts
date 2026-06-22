import { describe, expect, test, vi } from "../../test-fixtures";

import type { Address } from "viem";
import { grantPermitMutationOptions } from "../grant-permit";
import { hasPermitQueryOptions } from "../has-permit";
import { revokePermitsMutationOptions } from "../revoke-permits";

describe("grantPermitMutationOptions", () => {
  test("calls sdk.permits.grantPermit with provided addresses", async ({ sdk }) => {
    const allowSpy = vi.spyOn(sdk.permits, "grantPermit").mockResolvedValue();

    const options = grantPermitMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.grantPermit"]);

    const addresses = [
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    ] as Address[];
    await options.mutationFn(addresses);

    expect(allowSpy).toHaveBeenCalledWith(addresses);
  });
});

describe("revokePermitsMutationOptions", () => {
  test("calls sdk.permits.revokePermits with no arguments", async ({ sdk }) => {
    const revokeSpy = vi.spyOn(sdk.permits, "revokePermits").mockResolvedValue(undefined);

    const options = revokePermitsMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.revokePermits"]);

    await options.mutationFn(undefined as void);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith();
  });
});

describe("hasPermitQueryOptions", () => {
  test("calls sdk.permits.hasPermit", async ({ sdk }) => {
    const isAllowedSpy = vi.spyOn(sdk.permits, "hasPermit").mockResolvedValue(true);

    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });
    expect(options.queryKey).toEqual([
      "zama.hasPermit",
      {
        contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      },
    ]);

    const result = await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);
    expect(result).toBe(true);
    expect(isAllowedSpy).toHaveBeenCalledTimes(1);
  });

  test("forwards contractAddresses to sdk.permits.hasPermit", async ({ sdk }) => {
    const isAllowedSpy = vi.spyOn(sdk.permits, "hasPermit").mockResolvedValue(true);

    const contracts = [
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    ] as [Address, ...Address[]];

    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: contracts,
    });

    await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);

    expect(isAllowedSpy).toHaveBeenCalledWith(contracts);
  });

  test("opts out of query result caching", ({ sdk }) => {
    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(0);
  });

  test("enabled is false when query.enabled is false", ({ sdk }) => {
    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("is disabled when the contract list is empty", ({ sdk }) => {
    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: [],
    });

    expect(options.enabled).toBe(false);
  });

  test("is disabled when signer is absent", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual([
      "zama.hasPermit",
      {
        contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      },
    ]);
  });

  test("manual fetch without signer returns false (pure store lookup)", async ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });

    const options = hasPermitQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    const result = await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);
    expect(result).toBe(false);
  });

  test("contract addresses and wallet account scope the query key", ({ sdk, signer }) => {
    const walletAccount = signer.walletAccount.getSnapshot();

    const optionsA = hasPermitQueryOptions(
      sdk,
      {
        contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      },
      { walletAccount },
    );
    const optionsB = hasPermitQueryOptions(
      sdk,
      {
        contractAddresses: ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a"],
      },
      { walletAccount },
    );

    expect(optionsA.enabled).toBe(true);
    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey[1]).toEqual({
      walletAddress: walletAccount!.address,
      walletChainId: walletAccount!.chainId,
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });
  });
});
