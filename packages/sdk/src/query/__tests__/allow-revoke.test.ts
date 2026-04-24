import { describe, expect, test, vi } from "../../test-fixtures";

import type { Address } from "viem";
import { ZamaSDK } from "../../zama-sdk";
import { allowMutationOptions } from "../allow";
import { isAllowedQueryOptions } from "../is-allowed";
import { revokeMutationOptions } from "../revoke";
import { revokeSessionMutationOptions } from "../revoke-session";

describe("allowMutationOptions", () => {
  test("calls sdk.allow with provided addresses", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
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

describe("revokeMutationOptions", () => {
  test("calls sdk.credentials.revoke with provided addresses", async ({
    signer,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const revokeSpy = vi.spyOn(sdk.credentials, "revoke").mockResolvedValue(undefined);

    const options = revokeMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.revoke"]);

    const addresses = ["0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a"] as Address[];
    await options.mutationFn(addresses);

    expect(revokeSpy).toHaveBeenCalledWith(...addresses);
  });
});

describe("revokeSessionMutationOptions", () => {
  test("calls sdk.revokeSession", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const revokeSessionSpy = vi.spyOn(sdk, "revokeSession").mockResolvedValue(undefined);

    const options = revokeSessionMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.revokeSession"]);

    await options.mutationFn(undefined as void);

    expect(revokeSessionSpy).toHaveBeenCalledTimes(1);
  });
});

describe("isAllowedQueryOptions", () => {
  test("calls sdk.credentials.isAllowed", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const isAllowedSpy = vi.spyOn(sdk.credentials, "isAllowed").mockResolvedValue(true);

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

  test("forwards contractAddresses to credentials.isAllowed", async ({
    signer,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const isAllowedSpy = vi.spyOn(sdk.credentials, "isAllowed").mockResolvedValue(true);

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

  test("opts out of query result caching", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(0);
  });

  test("enabled is false when query.enabled is false", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("is disabled when signer-backed credentials are absent", ({
    relayer,
    provider,
    storage,
  }) => {
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

  test("manual fetch without signer-backed credentials throws instead of caching a value", async ({
    relayer,
    provider,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });

    const options = isAllowedQueryOptions(sdk, {
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(() =>
      options.queryFn({
        queryKey: options.queryKey,
      } as Parameters<typeof options.queryFn>[0]),
    ).toThrow("Cannot isAllowed without a signer");
  });

  test("contract addresses are the only query key parameters", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

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
