import { assertType, describe, expectTypeOf, test } from "vitest";
import { mainnet, sepolia } from "../../chains";
import type { AtLeastOneChain, FheChain } from "../../chains";
import { createConfig } from "../create";
import { createConfig as createViemConfig } from "../../viem/config";
import { createConfig as createEthersConfig } from "../../ethers/config";
import type { GenericProvider } from "../../types";
import type { ZamaConfigBase, RelayerConfig, RelayersFor } from "../types";
import type { EIP1193Provider, PublicClient, WalletClient } from "viem";
import type { ZamaConfigViem } from "../../viem/types";
import type { ZamaConfigEthers } from "../../ethers/types";

describe("FheChain", () => {
  test("preset chains carry literal id types", () => {
    expectTypeOf(sepolia.id).toEqualTypeOf<11155111>();
    expectTypeOf(mainnet.id).toEqualTypeOf<1>();
  });

  test("FheChain<number> is backwards compatible", () => {
    const chain: FheChain = sepolia;
    expectTypeOf(chain.id).toEqualTypeOf<number>();
  });

  test("keeps the legacy __type relayer auth discriminator", () => {
    assertType<FheChain>({ ...sepolia, auth: { __type: "ApiKeyHeader", value: "secret" } });

    assertType<FheChain>({
      ...sepolia,
      // @ts-expect-error — the low-level `type` discriminator stays behind the adapter
      auth: { type: "ApiKeyHeader", value: "secret" },
    });
  });
});

describe("ZamaConfigViem", () => {
  test("accepts publicClient at top level", () => {
    expectTypeOf<ZamaConfigViem>().toHaveProperty("publicClient");
  });

  test("does not have a viem wrapper property", () => {
    expectTypeOf<ZamaConfigViem>().not.toHaveProperty("viem");
  });
});

describe("ZamaConfigEthers", () => {
  test("does not have an ethers wrapper property", () => {
    expectTypeOf<ZamaConfigEthers>().not.toHaveProperty("ethers");
  });
});

describe("ZamaConfigBase (mapped relayers)", () => {
  test("requires a relayer entry for every chain in the tuple", () => {
    // Valid: relayer for every chain
    assertType<ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>>({
      chains: [sepolia, mainnet] as const,
      relayers: { [sepolia.id]: {} as RelayerConfig, [mainnet.id]: {} as RelayerConfig },
    });
  });

  test("rejects missing relayer entries", () => {
    assertType<ZamaConfigBase<readonly [typeof sepolia, typeof mainnet]>>({
      chains: [sepolia, mainnet] as const,
      // @ts-expect-error — mainnet relayer is missing
      relayers: { [sepolia.id]: {} as RelayerConfig },
    });
  });

  test("rejects empty chains tuple", () => {
    // @ts-expect-error — empty tuple does not satisfy AtLeastOneChain
    assertType<ZamaConfigBase<readonly []>>({ chains: [] as const, relayers: {} });
  });
});

// Closures keep createConfig unevaluated: only its parameter types are under test.
describe("createConfig (exact relayers)", () => {
  const provider = {} as GenericProvider;
  const relayer = {} as RelayerConfig;

  test("rejects an orphaned relayer key in an inline map (excess property check)", () => {
    assertType(() =>
      createConfig({
        chains: [mainnet],
        // @ts-expect-error: sepolia has a relayer but no chains entry
        relayers: { [mainnet.id]: relayer, [sepolia.id]: relayer },
        provider,
      }),
    );
  });

  test("rejects an orphaned relayer key in a map held in a variable", () => {
    const relayers = { [mainnet.id]: relayer, [sepolia.id]: relayer };
    // @ts-expect-error: sepolia has a relayer but no chains entry
    assertType(() => createConfig({ chains: [mainnet], relayers, provider }));
  });

  test("rejects a map held in a variable that misses a chain", () => {
    const relayers = { [mainnet.id]: relayer };
    // @ts-expect-error: sepolia has no relayer entry
    assertType(() => createConfig({ chains: [mainnet, sepolia], relayers, provider }));
  });

  test("accepts a map held in a variable that matches the chains", () => {
    const relayers = { [mainnet.id]: relayer, [sepolia.id]: relayer };
    assertType(() => createConfig({ chains: [mainnet, sepolia], relayers, provider }));
  });

  test("accepts a generic wrapper forwarding chains and relayers", () => {
    assertType(
      <const TChains extends AtLeastOneChain>(chains: TChains, relayers: RelayersFor<TChains>) =>
        createConfig({ chains, relayers, provider }),
    );
  });

  test("accepts an explicit chains type argument", () => {
    assertType(() =>
      createConfig<readonly [typeof mainnet]>({
        chains: [mainnet],
        relayers: { [mainnet.id]: relayer },
        provider,
      }),
    );
  });

  test("still accepts widened chains and relayers, which it cannot check", () => {
    const chains = [mainnet] as AtLeastOneChain;
    const relayers: Record<number, RelayerConfig> = { [sepolia.id]: relayer };
    assertType(() => createConfig({ chains, relayers, provider }));
  });
});

describe("adapter createConfig (exact relayers)", () => {
  const relayer = {} as RelayerConfig;
  const orphaned = { [mainnet.id]: relayer, [sepolia.id]: relayer };
  const viem = { publicClient: {} as PublicClient, walletClient: {} as WalletClient };
  const ethers = { ethereum: {} as EIP1193Provider };

  test("viem rejects an orphaned relayer key held in a variable", () => {
    // @ts-expect-error: sepolia has a relayer but no chains entry
    assertType(() => createViemConfig({ chains: [mainnet], relayers: orphaned, ...viem }));
    assertType(() => createViemConfig({ chains: [mainnet, sepolia], relayers: orphaned, ...viem }));
  });

  test("ethers rejects an orphaned relayer key held in a variable", () => {
    // @ts-expect-error: sepolia has a relayer but no chains entry
    assertType(() => createEthersConfig({ chains: [mainnet], relayers: orphaned, ...ethers }));
    assertType(() =>
      createEthersConfig({ chains: [mainnet, sepolia], relayers: orphaned, ...ethers }),
    );
  });
});
