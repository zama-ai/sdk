import type { Address } from "viem";
import type { GenericSigner, GenericStorage } from "../types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { RelayerWebSecurityConfig } from "../relayer/relayer-sdk.types";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";
import { RelayerWeb } from "../relayer/relayer-web";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { CompositeRelayer } from "../relayer/composite-relayer";
import { MemoryStorage } from "../storage/memory-storage";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { ConfigurationError } from "../errors";
import { ViemSigner } from "../viem";
import { EthersSigner } from "../ethers";
import type { TransportConfig } from "./transports";
import { isCleartextTransport, isFhevmTransport } from "./transports";
import type { ZamaConfigViem, ZamaConfigEthers, ZamaConfigCustomSigner } from "./types";

// ── Storage defaults ─────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";
const defaultStorage = isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage();
const defaultSessionStorage = isBrowser
  ? new IndexedDBStorage("SessionStore")
  : new MemoryStorage();

export function resolveStorage(
  storage: GenericStorage | undefined,
  sessionStorage: GenericStorage | undefined,
): { storage: GenericStorage; sessionStorage: GenericStorage } {
  return {
    storage: storage ?? defaultStorage,
    sessionStorage: sessionStorage ?? defaultSessionStorage,
  };
}

// ── Signer resolution ────────────────────────────────────────────────────────

export type ConfigWithTransports = ZamaConfigViem | ZamaConfigEthers | ZamaConfigCustomSigner;

export function resolveSigner(params: ConfigWithTransports): GenericSigner {
  if ("viem" in params && params.viem) {
    return new ViemSigner(params.viem);
  }
  if ("ethers" in params && params.ethers) {
    return new EthersSigner(params.ethers);
  }
  return params.signer;
}

// ── Chain transport resolution ───────────────────────────────────────────────

export function resolveChainTransports(
  chains: ExtendedFhevmInstanceConfig[],
  transports: Record<number, TransportConfig> | undefined,
  chainIds: number[],
): Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }> {
  const chainMap = new Map(chains.map((c) => [c.chainId, c]));
  const result = new Map<
    number,
    { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }
  >();

  for (const id of chainIds) {
    const chainConfig = chainMap.get(id);
    const userTransport = transports?.[id];

    if (!chainConfig && !userTransport) {
      throw new ConfigurationError(
        `Chain ${id} has no FHE chain config in the chains array and no transport override. ` +
          `Add it to chains or provide a transport.`,
      );
    }

    if (userTransport && isCleartextTransport(userTransport)) {
      if (!chainConfig) {
        throw new ConfigurationError(
          `Chain ${id} uses cleartext transport but has no entry in the chains array. ` +
            `Add the chain config to the chains array.`,
        );
      }
      result.set(id, { chain: chainConfig, transport: userTransport });
    } else if (chainConfig) {
      const base = { __mode: "fhevm" as const, ...chainConfig };
      if (userTransport && isFhevmTransport(userTransport)) {
        const { __mode: _, ...overrides } = userTransport;
        result.set(id, {
          chain: chainConfig,
          transport: { ...base, ...overrides },
        });
      } else {
        result.set(id, { chain: chainConfig, transport: base });
      }
    }
  }

  return result;
}

// ── Relayer building ─────────────────────────────────────────────────────────

export function buildRelayer(
  chainTransports: Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  const webTransports: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
  const cleartextRelayers = new Map<number, RelayerCleartext>();
  let security: RelayerWebSecurityConfig | undefined;
  let threads: number | undefined;

  for (const [chainId, { chain, transport }] of chainTransports) {
    if (isCleartextTransport(transport)) {
      cleartextRelayers.set(
        chainId,
        new RelayerCleartext({
          chainId: chain.chainId,
          gatewayChainId: chain.gatewayChainId,
          aclContractAddress: chain.aclContractAddress as Address,
          verifyingContractAddressDecryption: chain.verifyingContractAddressDecryption as Address,
          verifyingContractAddressInputVerification:
            chain.verifyingContractAddressInputVerification as Address,
          registryAddress: chain.registryAddress,
          network: (transport.network ?? chain.network) as CleartextConfig["network"],
          executorAddress: transport.executorAddress,
          kmsSignerPrivateKey: transport.kmsSignerPrivateKey,
          inputSignerPrivateKey: transport.inputSignerPrivateKey,
        }),
      );
    } else if (isFhevmTransport(transport)) {
      const { __mode: _, security: s, threads: t, ...fhevmConfig } = transport;
      if (s) {
        security = s;
      }
      if (t) {
        threads = t;
      }
      webTransports[chainId] = fhevmConfig;
    }
  }

  if (cleartextRelayers.size === 0) {
    return new RelayerWeb({
      getChainId: resolveChainId,
      transports: webTransports,
      security,
      threads,
    });
  }

  if (Object.keys(webTransports).length === 0) {
    return new CompositeRelayer(resolveChainId, cleartextRelayers as Map<number, RelayerSDK>);
  }

  const webRelayer = new RelayerWeb({
    getChainId: resolveChainId,
    transports: webTransports,
    security,
    threads,
  });
  const allRelayers = new Map<number, RelayerSDK>(cleartextRelayers);
  for (const id of Object.keys(webTransports)) {
    allRelayers.set(Number(id), webRelayer);
  }
  return new CompositeRelayer(resolveChainId, allRelayers);
}
