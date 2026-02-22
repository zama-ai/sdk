import { describe, it, expect, vi } from "vitest";
import { TokenSDK } from "../token-sdk";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import { MemoryStorage } from "../memory-storage";
import type { ConfidentialSigner } from "../token.types";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";

function createMockSigner(): ConfidentialSigner {
  return {
    getAddress: vi.fn().mockResolvedValue("0xuser"),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
  };
}

function createMockRelayer(): RelayerSDK {
  return {
    generateKeypair: vi.fn(),
    createEIP712: vi.fn(),
    encrypt: vi.fn(),
    userDecrypt: vi.fn(),
    publicDecrypt: vi.fn(),
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi.fn(),
    getPublicParams: vi.fn(),
    terminate: vi.fn(),
  };
}

describe("TokenSDK", () => {
  const storage = new MemoryStorage();
  const signer = createMockSigner();
  const relayer = createMockRelayer();

  const sdk = new TokenSDK({
    relayer,
    signer,
    storage,
  });

  it("exposes signer and storage", () => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createReadonlyToken returns ReadonlyToken", () => {
    const token = sdk.createReadonlyToken("0xtoken" as Address);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe("0xtoken");
    expect(token.signer).toBe(signer);
  });

  it("createToken returns Token", () => {
    const token = sdk.createToken("0xtoken" as Address);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe("0xtoken");
  });

  it("creates distinct instances per address", () => {
    const t1 = sdk.createReadonlyToken("0xaaa" as Address);
    const t2 = sdk.createReadonlyToken("0xbbb" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaaa");
    expect(t2.address).toBe("0xbbb");
  });

  it("terminate delegates to relayer.terminate", () => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });
});
