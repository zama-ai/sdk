import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useWrapperDiscovery } from "../use-wrapper-discovery";
import { TOKEN } from "../../__tests__/mutation-test-helpers";

const ERC20_ADDR = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;

describe("useWrapperDiscovery", () => {
  test("behavior: disabled when erc20Address is undefined", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useWrapperDiscovery({ tokenAddress: TOKEN, erc20Address: undefined }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when user passes enabled=false", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useWrapperDiscovery({ tokenAddress: TOKEN, erc20Address: ERC20_ADDR }, { enabled: false }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("behavior: erc20Address: undefined -> defined", async ({ createWrapper, signer }) => {
    const wrapperAddress = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
    // Mock chainId to Mainnet (has default registry)
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce([true, wrapperAddress]) // getConfidentialTokenAddress
      .mockResolvedValueOnce(true); // isConfidentialTokenValid

    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ erc20Address }) => useWrapperDiscovery({ tokenAddress: TOKEN, erc20Address }),
      {
        wrapper: ctx.Wrapper,
        initialProps: { erc20Address: undefined as Address | undefined },
      },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({ erc20Address: ERC20_ADDR });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(wrapperAddress);
  });

  test("default", async ({ renderWithProviders, signer }) => {
    const wrapperAddress = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce([true, wrapperAddress]) // getConfidentialTokenAddress
      .mockResolvedValueOnce(true); // isConfidentialTokenValid

    const { result } = renderWithProviders(() =>
      useWrapperDiscovery({
        tokenAddress: TOKEN,
        erc20Address: ERC20_ADDR,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toBe(wrapperAddress);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getConfidentialTokenAddress" }),
    );
  });
});
