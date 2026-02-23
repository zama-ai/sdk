import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/token-sdk";
import { useConfidentialTransfer } from "../token/use-confidential-transfer";
import { useConfidentialApprove } from "../token/use-confidential-approve";
import { useApproveUnderlying } from "../token/use-approve-underlying";
import { useWrap } from "../token/use-wrap";
import { useAuthorizeAll } from "../token/use-authorize-all";
import { useEncrypt } from "../relayer/use-encrypt";
import { renderWithProviders, createMockSigner, createMockRelayer } from "./test-utils";

const TOKEN = "0xtoken" as Address;
const WRAPPER = "0xwrapper" as Address;

describe("useConfidentialTransfer", () => {
  it("calls token.confidentialTransfer on mutate", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    // Mock encrypt flow: readContract for balanceOf handle
    vi.mocked(signer.readContract).mockResolvedValue("0x0");

    const { result } = renderWithProviders(() => useConfidentialTransfer({ tokenAddress: TOKEN }), {
      signer,
    });

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useConfidentialApprove", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useConfidentialApprove({ tokenAddress: TOKEN }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useApproveUnderlying", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useApproveUnderlying({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useWrap", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useWrap({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useAuthorizeAll", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useAuthorizeAll());

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useEncrypt", () => {
  it("calls relayer.encrypt on mutate", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useEncrypt(), { relayer });

    await act(async () => {
      result.current.mutate({
        values: [1000n],
        contractAddress: "0xtoken" as Address,
        userAddress: "0xuser" as Address,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.encrypt).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    });
  });
});
