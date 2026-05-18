import { useQuery } from "@tanstack/react-query";
import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test } from "../../test-fixtures";
import { vi } from "vitest";
import { useDelegationStatus } from "../use-delegation-status";
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn(() => ({ data: undefined })) };
});

describe("useDelegationStatus", () => {
  test("disables query when tokenAddress is missing", ({
    renderWithProviders,
    RECIPIENT,
    USER,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: undefined,
        delegatorAddress: USER,
        delegateAddress: RECIPIENT,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  test("passes the shared queryKeyHashFn when addresses are provided", ({
    renderWithProviders,
    RECIPIENT,
    TOKEN,
    USER,
  }) => {
    vi.mocked(useQuery).mockReturnValue({
      data: { isDelegated: true, expiryTimestamp: 0n },
    } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: TOKEN,
        delegatorAddress: USER,
        delegateAddress: RECIPIENT,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKeyHashFn: hashFn,
        queryKey: zamaQueryKeys.delegationStatus.scope(TOKEN, USER, RECIPIENT),
        enabled: true,
      }),
    );
  });

  test("disables query when delegator is missing", ({ renderWithProviders, RECIPIENT, TOKEN }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: TOKEN,
        delegateAddress: RECIPIENT,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  test("disables query when delegate is missing", ({ renderWithProviders, TOKEN, USER }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: TOKEN,
        delegatorAddress: USER,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });
});
