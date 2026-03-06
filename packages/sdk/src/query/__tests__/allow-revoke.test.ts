import { describe, expect, test, vi } from "../../test-fixtures";
import type { Address } from "../../token/token.types";
import { ZamaSDK } from "../../token/zama-sdk";
import { allowMutationOptions } from "../allow";
import { revokeMutationOptions } from "../revoke";
import { revokeSessionMutationOptions } from "../revoke-session";
import { isAllowedQueryOptions } from "../is-allowed";

describe("allowMutationOptions", () => {
  test("calls sdk.allow with provided addresses", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const allowSpy = vi.spyOn(sdk, "allow").mockResolvedValue(undefined);

    const options = allowMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.allow"]);

    const addresses = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ] as Address[];
    await options.mutationFn(addresses);

    expect(allowSpy).toHaveBeenCalledWith(...addresses);
  });
});

describe("revokeMutationOptions", () => {
  test("calls sdk.revoke with provided addresses", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const revokeSpy = vi.spyOn(sdk, "revoke").mockResolvedValue(undefined);

    const options = revokeMutationOptions(sdk);
    expect(options.mutationKey).toEqual(["zama.revoke"]);

    const addresses = ["0x1111111111111111111111111111111111111111"] as Address[];
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
  test("calls sdk.isAllowed", async ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const isAllowedSpy = vi.spyOn(sdk, "isAllowed").mockResolvedValue(true);

    const options = isAllowedQueryOptions(sdk, {
      account: "0x1111111111111111111111111111111111111111",
    });
    expect(options.queryKey).toEqual([
      "zama.isAllowed",
      { account: "0x1111111111111111111111111111111111111111" },
    ]);

    const result = await options.queryFn({
      queryKey: options.queryKey,
    } as Parameters<typeof options.queryFn>[0]);
    expect(result).toBe(true);
    expect(isAllowedSpy).toHaveBeenCalledTimes(1);
  });

  test("sets staleTime to Infinity", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      account: "0x1111111111111111111111111111111111111111",
    });

    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled is false when query.enabled is false", ({ signer, relayer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });

    const options = isAllowedQueryOptions(sdk, {
      account: "0x1111111111111111111111111111111111111111",
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });
});
