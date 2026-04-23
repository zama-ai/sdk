import { assertType, describe, expectTypeOf, it } from "vitest";
import { mainnet, sepolia } from "../../chains";
import type { FheChain } from "../../chains";
import type { ZamaConfigBase } from "../types";
import type { TransportConfig } from "../transports";
import type { ZamaConfigViem } from "../../viem/types";
import type { ZamaConfigEthers } from "../../ethers/types";

describe("FheChain", () => {
  it("preset chains carry literal id types", () => {
    expectTypeOf(sepolia.id).toEqualTypeOf<11155111>();
    expectTypeOf(mainnet.id).toEqualTypeOf<1>();
  });

  it("FheChain<number> is backwards compatible", () => {
    const chain: FheChain = sepolia;
    expectTypeOf(chain.id).toEqualTypeOf<number>();
  });
});

describe("ZamaConfigViem", () => {
  it("accepts publicClient at top level", () => {
    expectTypeOf<ZamaConfigViem>().toHaveProperty("publicClient");
  });

  it("does not have a viem wrapper property", () => {
    expectTypeOf<ZamaConfigViem>().not.toHaveProperty("viem");
  });
});

describe("ZamaConfigEthers", () => {
  it("does not have an ethers wrapper property", () => {
    expectTypeOf<ZamaConfigEthers>().not.toHaveProperty("ethers");
  });
});

describe("ZamaConfigBase (mapped transports)", () => {
  it("requires a transport entry for every chain in the tuple", () => {
    // Valid: transport for every chain
    assertType<ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>>({
      chains: [sepolia, mainnet] as const,
      transports: {
        [sepolia.id]: {} as TransportConfig,
        [mainnet.id]: {} as TransportConfig,
      },
    });
  });

  it("rejects missing transport entries", () => {
    assertType<ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>>({
      chains: [sepolia, mainnet] as const,
      // @ts-expect-error — mainnet transport is missing
      transports: { [sepolia.id]: {} as TransportConfig },
    });
  });

  it("rejects empty chains tuple", () => {
    // @ts-expect-error — empty tuple does not satisfy AtLeastOneChain
    assertType<ZamaConfigBase<readonly []>>({
      chains: [] as const,
      transports: {},
    });
  });
});
