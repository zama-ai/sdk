import { useQuery } from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";
import { describe, expect, test } from "../../test-fixtures";
import { vi } from "vitest";
import { useIsDelegationPropagated } from "../use-is-delegation-propagated";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn(() => ({ data: undefined })) };
});

const HANDLE = `0x${"aa".repeat(32)}` as const;

describe("useIsDelegationPropagated", () => {
  test("disables the query when encryptedInputs is empty", ({
    renderWithProviders,
    recipientAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useIsDelegationPropagated({ encryptedInputs: [], delegatorAddress: recipientAddress }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test("disables the query when delegatorAddress is missing", ({
    renderWithProviders,
    tokenAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useIsDelegationPropagated({
        encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test("is off by default even when inputs + delegator are provided (opt-in only)", ({
    renderWithProviders,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    renderWithProviders(() =>
      useIsDelegationPropagated({
        encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
        delegatorAddress: recipientAddress,
      }),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test("passes the shared queryKeyHashFn and enables when opted in", ({
    renderWithProviders,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(useQuery).mockReturnValue({ data: true } as never);

    renderWithProviders(() =>
      useIsDelegationPropagated(
        {
          encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
          delegatorAddress: recipientAddress,
        },
        { enabled: true },
      ),
    );

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ queryKeyHashFn: hashFn, enabled: true }),
    );
  });
});
