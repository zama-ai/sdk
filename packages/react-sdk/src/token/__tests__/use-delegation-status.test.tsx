import { useQuery } from "@tanstack/react-query";
import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test } from "../../test-fixtures";
import { vi } from "vitest";
import { useDelegationStatus } from "../use-delegation-status";
import { TOKEN, RECIPIENT, USER } from "../../__tests__/mutation-test-helpers";

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn(() => ({ data: undefined })) };
});

describe("useDelegationStatus", () => {
  test("passes the shared queryKeyHashFn when addresses are provided", ({
    renderWithProviders,
  }) => {
    vi.mocked(useQuery).mockReturnValue({
      data: { isDelegated: true, expiryTimestamp: 0n },
    } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: TOKEN,
        delegator: USER,
        delegate: RECIPIENT,
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

  test("disables query when delegator is missing", ({ renderWithProviders }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: TOKEN,
        delegate: RECIPIENT,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  test("disables query when delegate is missing", ({ renderWithProviders }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useDelegationStatus({
        tokenAddress: TOKEN,
        delegator: USER,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });
});
