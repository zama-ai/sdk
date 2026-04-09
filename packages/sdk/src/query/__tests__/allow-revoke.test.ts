import { describe, expect, test, vi } from "../../test-fixtures";

import { ZamaSDK } from "../../zama-sdk";
import { allowMutationOptions } from "../allow";
import { revokeMutationOptions } from "../revoke";
import { revokeSessionMutationOptions } from "../revoke-session";
import { isAllowedQueryOptions } from "../is-allowed";
import type { Address } from "viem";
import type { CredentialSet } from "../../credentials/credential-set";

describe("allowMutationOptions", () => {
  test("calls sdk.credentials.allow with provided addresses", async ({
    signer,
    relayer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const allowSpy = vi.spyOn(sdk.credentials, "allow").mockResolvedValue({
      batches: [],
      failures: new Map(),
      credentialFor: () => {
        throw new Error("not used");
      },
      tryCredentialFor: () => null,
    } as CredentialSet);

    const options = allowMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.allow"]);

    const addresses = [
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    ] as Address[];
    await options.mutationFn(addresses);

    expect(allowSpy).toHaveBeenCalledWith(...addresses);
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
      account: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });
    expect(options.queryKey).toEqual([
      "zama.isAllowed",
      {
        account: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
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
      account: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      contractAddresses: contracts,
    });

    await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);

    expect(isAllowedSpy).toHaveBeenCalledWith(contracts);
  });

  test("staleTime should be 30 seconds", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      account: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
    });

    expect(options.staleTime).toBe(30_000);
  });

  test("enabled is false when query.enabled is false", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      account: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
      contractAddresses: ["0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B"],
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });
});
