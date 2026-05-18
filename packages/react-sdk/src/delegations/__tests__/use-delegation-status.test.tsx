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
    recipientAddress,
    userAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: undefined,
        delegatorAddress: userAddress,
        delegateAddress: recipientAddress,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test("passes the shared queryKeyHashFn when addresses are provided", ({
    renderWithProviders,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({
      data: { isDelegated: true, expiryTimestamp: 0n },
    } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: tokenAddress,
        delegatorAddress: userAddress,
        delegateAddress: recipientAddress,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKeyHashFn: hashFn,
        queryKey: zamaQueryKeys.delegationStatus.scope(tokenAddress, userAddress, recipientAddress),
        enabled: true,
      }),
    );
  });

  test("disables query when delegator is missing", ({
    renderWithProviders,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({ tokenAddress: tokenAddress, delegateAddress: recipientAddress }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test("disables query when delegate is missing", ({
    renderWithProviders,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({ tokenAddress: tokenAddress, delegatorAddress: userAddress }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
