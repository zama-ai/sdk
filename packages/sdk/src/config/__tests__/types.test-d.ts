import { assertType, describe, expectTypeOf, it } from "vitest";
import { mainnet, sepolia } from "../../chains";
import type { FheChain } from "../../chains";
import type { ZamaConfigBase } from "../types";
import type { RelayerConfig } from "../transports";
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

describe("ZamaConfigBase (mapped relayers)", () => {
  it("requires a relayer entry for every chain in the tuple", () => {
    // Valid: relayer for every chain
    assertType<ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>>({
      chains: [sepolia, mainnet] as const,
      relayers: {
        [sepolia.id]: {} as RelayerConfig,
        [mainnet.id]: {} as RelayerConfig,
      },
    });
  });

  it("rejects missing relayer entries", () => {
    assertType<ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>>({
      chains: [sepolia, mainnet] as const,
      // @ts-expect-error — mainnet relayer is missing
      relayers: { [sepolia.id]: {} as RelayerConfig },
    });
  });

  it("rejects empty chains tuple", () => {
    // @ts-expect-error — empty tuple does not satisfy AtLeastOneChain
    assertType<ZamaConfigBase<readonly []>>({
      chains: [] as const,
      relayers: {},
    });
  });
});
