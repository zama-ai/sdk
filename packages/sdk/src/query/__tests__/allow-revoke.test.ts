import { describe, expect, test, vi } from "../../test-fixtures";

import type { Address } from "viem";
import { ZamaSDK } from "../../zama-sdk";
import { allowMutationOptions } from "../allow";
import { isAllowedQueryOptions } from "../is-allowed";
import { revokePermitsMutationOptions } from "../revoke-permits";

describe("allowMutationOptions", () => {
  test("calls sdk.allow with provided addresses", async ({
    signer,
    provider,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const allowSpy = vi.spyOn(sdk, "allow").mockResolvedValue();

    const options = allowMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.allow"]);

    const addresses = [
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    ] as Address[];
    await options.mutationFn(addresses);

    expect(allowSpy).toHaveBeenCalledWith(addresses);
  });
});

describe("revokePermitsMutationOptions", () => {
  test("calls sdk.revokePermits with no arguments", async ({
    signer,
    provider,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const revokeSpy = vi.spyOn(sdk, "revokePermits").mockResolvedValue(undefined);

    const options = revokePermitsMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.revokePermits"]);

    await options.mutationFn(undefined as void);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith();
  });
});

describe("isAllowedQueryOptions", () => {
  test("calls sdk.isAllowed", async ({ signer, provider, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const isAllowedSpy = vi.spyOn(sdk, "isAllowed").mockResolvedValue(true);

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });
    expect(options.queryKey).toEqual([
      "zama.isAllowed",
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

  test("forwards contractAddresses to sdk.isAllowed", async ({
    signer,
    provider,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });
    const isAllowedSpy = vi.spyOn(sdk, "isAllowed").mockResolvedValue(true);

    const contracts = [
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    ] as [Address, ...Address[]];

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: contracts,
    });

    await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);

    expect(isAllowedSpy).toHaveBeenCalledWith(contracts);
  });

  test("opts out of query result caching", ({ signer, provider, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(0);
  });

  test("enabled is false when query.enabled is false", ({ signer, provider, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("is disabled when signer is absent", ({ relayer, provider, storage }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual([
      "zama.isAllowed",
      {
        contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      },
    ]);
  });

  test("manual fetch without signer returns false (pure store lookup)", async ({
    relayer,
    provider,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    const result = await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);
    expect(result).toBe(false);
  });

  test("contract addresses are the only query key parameters", ({
    signer,
    provider,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, signer, storage });

    const optionsA = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });
    const optionsB = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a"],
    });

    expect(optionsA.enabled).toBe(true);
    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey[1]).toEqual({
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });
  });
});
