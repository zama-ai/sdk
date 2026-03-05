import { beforeEach, describe, expect, it } from "vitest";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import type { GenericSigner } from "../token.types";
import { MemoryStorage } from "../memory-storage";
import { createMockRelayer, createMockSigner } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;

describe("Address normalization (P6)", () => {
  let sdk: ReturnType<typeof createMockRelayer>;
  let signer: GenericSigner;

  beforeEach(() => {
    sdk = createMockRelayer();
    signer = createMockSigner();
  });

  it("preserves token address case in constructor", () => {
    const token = new Token({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.address).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
  });

  it("preserves wrapper address case in constructor", () => {
    const token = new Token({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN,
      wrapper: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.wrapper).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
  });

  it("defaults wrapper to normalized address when not provided", () => {
    const token = new Token({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.wrapper).toBe(token.address);
  });

  it("rejects invalid address in constructor", () => {
    expect(
      () =>
        new Token({
          relayer: sdk as unknown as RelayerSDK,
          signer,
          storage: new MemoryStorage(),
          sessionStorage: new MemoryStorage(),
          address: "0xinvalid" as Address,
        }),
    ).toThrow("address must be a valid address");
  });
});
