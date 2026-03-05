import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useUserDecryptFlow } from "../relayer/use-user-decrypt-flow";
import { decryptionKeys } from "../relayer/decryption-cache";
import { renderWithProviders, createMockRelayer, createMockSigner } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;

describe("useUserDecryptFlow", () => {
  it("runs the full flow: keypair → EIP712 → sign → decrypt", async () => {
    const relayer = createMockRelayer();
    const signer = createMockSigner();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });

    const { result, queryClient } = renderWithProviders(() => useUserDecryptFlow(), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [
        { handle: "0xhandle1", contractAddress: TOKEN },
        { handle: "0xhandle2", contractAddress: TOKEN },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();

    expect(result.current.data).toEqual({ "0xhandle1": 100n, "0xhandle2": true });

    // Verify decryption cache was populated
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(100n);
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle2"))).toBe(true);
  });

  it("fires step callbacks in correct order", async () => {
    const relayer = createMockRelayer();
    const signer = createMockSigner();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xh": 42n });

    const order: string[] = [];
    const callbacks = {
      onKeypairGenerated: vi.fn(() => order.push("keypair")),
      onEIP712Created: vi.fn(() => order.push("eip712")),
      onSigned: vi.fn(() => order.push("signed")),
      onDecrypted: vi.fn(() => order.push("decrypted")),
    };

    const { result } = renderWithProviders(() => useUserDecryptFlow({ callbacks }), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [{ handle: "0xh", contractAddress: TOKEN }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(order).toEqual(["keypair", "eip712", "signed", "decrypted"]);
    expect(callbacks.onSigned).toHaveBeenCalledWith("0xsig");
    expect(callbacks.onDecrypted).toHaveBeenCalledWith({ "0xh": 42n });
  });

  it("groups handles by contract address", async () => {
    const relayer = createMockRelayer();
    const signer = createMockSigner();
    const CONTRACT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const CONTRACT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 10n })
      .mockResolvedValueOnce({ "0xh2": 20n });

    const { result } = renderWithProviders(() => useUserDecryptFlow(), { relayer, signer });

    result.current.mutate({
      handles: [
        { handle: "0xh1", contractAddress: CONTRACT_A },
        { handle: "0xh2", contractAddress: CONTRACT_B },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should call userDecrypt twice (once per contract)
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ "0xh1": 10n, "0xh2": 20n });
  });

  it("deduplicates contract addresses for EIP-712", async () => {
    const relayer = createMockRelayer();
    const signer = createMockSigner();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xh1": 1n, "0xh2": 2n });

    const { result } = renderWithProviders(() => useUserDecryptFlow(), { relayer, signer });

    result.current.mutate({
      handles: [
        { handle: "0xh1", contractAddress: TOKEN },
        { handle: "0xh2", contractAddress: TOKEN },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // EIP-712 should be called with deduplicated addresses
    expect(relayer.createEIP712).toHaveBeenCalledWith(
      "0xpub",
      [TOKEN], // single address, not duplicated
      expect.any(Number),
      1, // default durationDays
    );
  });

  it("uses custom durationDays", async () => {
    const relayer = createMockRelayer();
    const signer = createMockSigner();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xh": 1n });

    const { result } = renderWithProviders(() => useUserDecryptFlow(), { relayer, signer });

    result.current.mutate({
      handles: [{ handle: "0xh", contractAddress: TOKEN }],
      durationDays: 7,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", [TOKEN], expect.any(Number), 7);
  });

  it("reports error when keypair generation fails", async () => {
    const relayer = createMockRelayer();
    vi.mocked(relayer.generateKeypair).mockRejectedValue(new Error("keygen failed"));

    const { result } = renderWithProviders(() => useUserDecryptFlow(), { relayer });

    result.current.mutate({
      handles: [{ handle: "0xh", contractAddress: TOKEN }],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("keygen failed");
  });
});
