import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useWrapperDiscovery } from "../use-wrapper-discovery";
import { TOKEN, COORDINATOR } from "../../__tests__/mutation-test-helpers";

describe("useWrapperDiscovery", () => {
  test("behavior: disabled when coordinatorAddress is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useWrapperDiscovery({ tokenAddress: TOKEN, coordinatorAddress: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when user passes enabled=false", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useWrapperDiscovery(
        { tokenAddress: TOKEN, coordinatorAddress: COORDINATOR },
        { enabled: false },
      ),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("behavior: coordinatorAddress: undefined -> defined", async ({ createWrapper, signer }) => {
    const wrapperAddress = "0x7777777777777777777777777777777777777777" as Address;
    vi.mocked(signer.readContract).mockResolvedValue(wrapperAddress);

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ coordinatorAddress }) => useWrapperDiscovery({ tokenAddress: TOKEN, coordinatorAddress }),
      {
        wrapper: ctx.Wrapper,
        initialProps: { coordinatorAddress: undefined as Address | undefined },
      },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ coordinatorAddress: COORDINATOR });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(wrapperAddress);
  });

  test("default", async ({ renderWithProviders, signer }) => {
    const wrapperAddress = "0x4444444444444444444444444444444444444444" as Address;
    vi.mocked(signer.readContract).mockResolvedValue(wrapperAddress);

    const { result } = renderWithProviders(() =>
      useWrapperDiscovery({
        tokenAddress: TOKEN,
        coordinatorAddress: COORDINATOR,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(wrapperAddress);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "wrapperExists", address: COORDINATOR }),
    );
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getWrapper", address: COORDINATOR }),
    );
  });
});
