import { createPublicClient, http } from "viem";
import { createConfig, ZamaSDK, ConfigurationError, type GenericProvider } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { ViemProvider } from "@zama-fhe/sdk/viem";
import type { StorageManager } from "./storage-manager.js";
import { parseContextConfig } from "./sdk-config.js";
import type { ContextFactory } from "./runtime.js";

export function createContextFactory(manager: StorageManager): ContextFactory {
  return async (request, signer, remote) => {
    const primary = await manager.resolve(request.storage, remote);
    const permits =
      request.permitStorage === undefined
        ? primary
        : await manager.resolve(request.permitStorage, remote);
    const { chains, chainId, ...options } = parseContextConfig(request.configJson);
    const providers = new Map(
      chains.map((chain) => [
        chain.id,
        new ViemProvider({ publicClient: createPublicClient({ transport: http(chain.network) }) }),
      ]),
    );
    const current = () => {
      const selected = signer?.walletAccount.getSnapshot()?.chainId ?? chainId;
      const provider = providers.get(selected);
      if (!provider) {
        throw new ConfigurationError("Wallet chain is not configured in this SDK context.");
      }
      return provider;
    };
    const provider: GenericProvider = {
      getChainId: () => current().getChainId(),
      readContract: (config) => current().readContract(config),
      waitForTransactionReceipt: (hash) => current().waitForTransactionReceipt(hash),
      getBlockTimestamp: () => current().getBlockTimestamp(),
      prepareTransaction: (args) => current().prepareTransaction(args),
    };
    const sdk = new ZamaSDK(
      createConfig({
        chains,
        signer,
        provider,
        storage: primary.storage,
        permitStorage: permits.storage,
        relayers: Object.fromEntries(chains.map((chain) => [chain.id, node()])),
        ...options,
      }),
    );
    return {
      sdk,
      credentialScope: options.transportKeyPairScope,
      storageIdentities: [...new Set([primary.identity, permits.identity])],
    };
  };
}
