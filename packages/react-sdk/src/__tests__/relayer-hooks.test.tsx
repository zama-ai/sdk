import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Address, RelayerSDKStatus } from "@zama-fhe/sdk";
import { useGenerateKeypair } from "../relayer/use-generate-keypair";
import { useCreateEIP712 } from "../relayer/use-create-eip712";
import { useCreateDelegatedUserDecryptEIP712 } from "../relayer/use-create-delegated-user-decrypt-eip712";
import { useUserDecryptRaw } from "../relayer/use-user-decrypt-raw";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { usePublicDecrypt } from "../relayer/use-public-decrypt";
import { useDelegatedUserDecrypt } from "../relayer/use-delegated-user-decrypt";
import { useRequestZKProofVerification } from "../relayer/use-request-zk-proof-verification";
import { useUserDecryptedValue } from "../relayer/use-user-decrypted-value";
import { useUserDecryptedValues } from "../relayer/use-user-decrypted-values";
import { useFHEvmStatus } from "../relayer/use-fhevm-status";
import { decryptionKeys } from "../relayer/decryption-cache";
import { renderWithProviders, createMockRelayer } from "./test-utils";

describe("decryptionKeys", () => {
  it("produces stable query keys", () => {
    expect(decryptionKeys.value("0xhandle1")).toEqual(["decryptedValue", "0xhandle1"]);
  });
});

describe("useGenerateKeypair", () => {
  it("delegates to relayer.generateKeypair", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useGenerateKeypair(), { relayer });

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ publicKey: "0xpub", privateKey: "0xpriv" });
  });
});

describe("useCreateEIP712", () => {
  it("delegates to relayer.createEIP712", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useCreateEIP712(), { relayer });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      startTimestamp: 1000,
      durationDays: 2,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", ["0xtoken"], 1000, 2);
  });

  it("passes undefined for optional durationDays", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useCreateEIP712(), { relayer });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      startTimestamp: 1000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", ["0xtoken"], 1000, undefined);
  });
});

describe("useCreateDelegatedUserDecryptEIP712", () => {
  it("delegates to relayer.createDelegatedUserDecryptEIP712", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useCreateDelegatedUserDecryptEIP712(), {
      relayer,
    });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      delegatorAddress: "0xdelegator",
      startTimestamp: 1000,
      durationDays: 3,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xtoken"],
      "0xdelegator",
      1000,
      3,
    );
  });

  it("passes undefined for optional durationDays", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useCreateDelegatedUserDecryptEIP712(), {
      relayer,
    });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      delegatorAddress: "0xdelegator",
      startTimestamp: 1000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xtoken"],
      "0xdelegator",
      1000,
      undefined,
    );
  });
});

describe("useUserDecrypt", () => {
  it("delegates to relayer.userDecrypt and populates cache", async () => {
    const relayer = createMockRelayer();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": 200n,
    });

    const { result, queryClient } = renderWithProviders(() => useUserDecryptRaw(), { relayer });

    result.current.mutate({
      handles: ["0xhandle1", "0xhandle2"],
      contractAddress: "0xtoken" as `0x${string}`,
      signedContractAddresses: ["0xtoken" as `0x${string}`],
      privateKey: "0xpriv",
      publicKey: "0xpub",
      signature: "0xsig",
      signerAddress: "0xuser" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 1,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();

    // Check decryption cache was populated
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(100n);
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle2"))).toBe(200n);
  });
});

describe("usePublicDecrypt", () => {
  it("delegates to relayer.publicDecrypt and populates cache", async () => {
    const relayer = createMockRelayer();
    vi.mocked(relayer.publicDecrypt).mockResolvedValue({
      clearValues: { "0xhandle1": 500n },
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    });

    const { result, queryClient } = renderWithProviders(() => usePublicDecrypt(), { relayer });

    result.current.mutate(["0xhandle1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.publicDecrypt).toHaveBeenCalledWith(["0xhandle1"]);

    // Check decryption cache was populated
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(500n);
  });
});

describe("useDelegatedUserDecrypt", () => {
  it("delegates to relayer.delegatedUserDecrypt", async () => {
    const relayer = createMockRelayer();
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({ "0xhandle1": 300n });

    const { result } = renderWithProviders(() => useDelegatedUserDecrypt(), { relayer });

    result.current.mutate({
      handles: ["0xhandle1"],
      contractAddress: "0xtoken" as `0x${string}`,
      signedContractAddresses: ["0xtoken" as `0x${string}`],
      privateKey: "0xpriv",
      publicKey: "0xpub",
      signature: "0xsig",
      delegatorAddress: "0xdelegator" as `0x${string}`,
      delegateAddress: "0xdelegate" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 1,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ "0xhandle1": 300n });
  });
});

describe("useRequestZKProofVerification", () => {
  it("delegates to relayer.requestZKProofVerification", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useRequestZKProofVerification(), { relayer });

    result.current.mutate({} as unknown as Parameters<typeof result.current.mutate>[0]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.requestZKProofVerification).toHaveBeenCalledOnce();
  });
});

describe("useUserDecryptedValue", () => {
  it("reads from decryption cache", () => {
    const { result, queryClient } = renderWithProviders(() => useUserDecryptedValue("0xhandle1"));

    // Initially no data
    expect(result.current.data).toBeUndefined();

    // Populate cache manually
    queryClient.setQueryData(decryptionKeys.value("0xhandle1"), 42n);
    // The query is disabled so it won't refetch - data comes from cache seed
  });

  it("handles undefined handle", () => {
    const { result } = renderWithProviders(() => useUserDecryptedValue(undefined));
    expect(result.current.data).toBeUndefined();
  });
});

describe("useUserDecryptedValues", () => {
  it("reads multiple handles from cache", () => {
    const { result } = renderWithProviders(() => useUserDecryptedValues(["0xh1", "0xh2"]));

    expect(result.current.data).toEqual({
      "0xh1": undefined,
      "0xh2": undefined,
    });
    expect(result.current.results).toHaveLength(2);
  });

  it("returns empty for empty handles", () => {
    const { result } = renderWithProviders(() => useUserDecryptedValues([]));
    expect(result.current.data).toEqual({});
    expect(result.current.results).toHaveLength(0);
  });
});

describe("useUserDecrypt (orchestrated)", () => {
  it("auto-manages credentials and populates cache", async () => {
    const relayer = createMockRelayer();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": 200n,
    });

    const { result, queryClient } = renderWithProviders(() => useUserDecrypt(), { relayer });

    result.current.mutate({
      handles: [
        { handle: "0xhandle1", contractAddress: "0xtoken" as Address },
        { handle: "0xhandle2", contractAddress: "0xtoken" as Address },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Credential flow: generateKeypair + createEIP712 + signTypedData
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createEIP712).toHaveBeenCalledOnce();

    // Decrypt was called with resolved credentials
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: ["0xhandle1", "0xhandle2"],
        contractAddress: "0xtoken",
      }),
    );

    // Check decryption cache was populated
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(100n);
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle2"))).toBe(200n);
  });

  it("deduplicates contract addresses for credential batching", async () => {
    const relayer = createMockRelayer();
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 10n,
      "0xhandle2": 20n,
    });

    const { result } = renderWithProviders(() => useUserDecrypt(), { relayer });

    result.current.mutate({
      handles: [
        { handle: "0xhandle1", contractAddress: "0xtokenA" as Address },
        { handle: "0xhandle2", contractAddress: "0xtokenA" as Address },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // createEIP712 should receive both contract addresses (deduplicated)
    expect(relayer.createEIP712).toHaveBeenCalledWith(
      expect.any(String),
      ["0xtokenA"],
      expect.any(Number),
      expect.any(Number),
    );
  });
});

describe("useFHEvmStatus", () => {
  it("returns 'ready' for relayers without status tracking", () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useFHEvmStatus(), { relayer });

    // Mock relayer doesn't implement getStatus/onStatusChange
    expect(result.current).toBe("ready");
  });

  it("returns status from relayer with getStatus", () => {
    const relayer = createMockRelayer();
    (relayer as unknown as Record<string, unknown>).getStatus = vi
      .fn()
      .mockReturnValue("initializing");
    (relayer as unknown as Record<string, unknown>).onStatusChange = vi
      .fn()
      .mockReturnValue(() => {});

    const { result } = renderWithProviders(() => useFHEvmStatus(), { relayer });
    expect(result.current).toBe("initializing" as RelayerSDKStatus);
  });
});
