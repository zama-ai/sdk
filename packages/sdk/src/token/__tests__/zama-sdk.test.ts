import { describe, it, expect, vi } from "vitest";
import { ZamaSDK } from "../zama-sdk";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import { MemoryStorage } from "../memory-storage";
import { CredentialsManager } from "../credential-manager";
import { SignerRequiredError } from "../errors";
import type { GenericSigner } from "../token.types";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";

function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue("0xuser"),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
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

describe("ZamaSDK", () => {
  const storage = new MemoryStorage();
  const signer = createMockSigner();
  const relayer = createMockRelayer();

  const sdk = new ZamaSDK({
    relayer,
    signer,
    storage,
  });

  it("exposes signer and storage", () => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createReadonlyToken returns ReadonlyToken", () => {
    const token = sdk.createReadonlyToken("0x1111111111111111111111111111111111111111" as Address);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe("0x1111111111111111111111111111111111111111");
    expect(token.signer).toBe(signer);
  });

  it("createToken returns Token", () => {
    const token = sdk.createToken("0x1111111111111111111111111111111111111111" as Address);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe("0x1111111111111111111111111111111111111111");
  });

  it("creates distinct instances per address", () => {
    const t1 = sdk.createReadonlyToken("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address);
    const t2 = sdk.createReadonlyToken("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(t2.address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("terminate delegates to relayer.terminate", () => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  describe("credentialsManager", () => {
    it("returns a CredentialsManager instance", () => {
      const cm = sdk.credentialsManager;
      expect(cm).toBeInstanceOf(CredentialsManager);
    });

    it("throws SignerRequiredError when no signer is set", () => {
      const noSignerSdk = new ZamaSDK({
        relayer: createMockRelayer(),
        storage: new MemoryStorage(),
      });
      expect(() => noSignerSdk.credentialsManager).toThrow(SignerRequiredError);
    });
  });
});
