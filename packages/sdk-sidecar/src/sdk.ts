import { createConfig, ZamaSDK, ConfigurationError, type GenericProvider } from "@zama-fhe/sdk";
import { sdkInstanceOptions } from "./sdk-options.js";
import { createHttpProvider } from "./provider.js";
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
    const { chains, chainId, processRuntime, relayers, providerConfigs, ...options } =
      parseContextConfig(request.config);
    const providers = new Map(
      chains.map((chain) => [
        chain.id,
        createHttpProvider(chain.network, providerConfigs.get(chain.id)),
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
        relayers,
        ...(processRuntime === undefined ? {} : { runtime: processRuntime }),
        ...options,
      }),
      sdkInstanceOptions(request.transportKeyPairDerivationSecret),
    );
    return {
      sdk,
      credentialScope: options.transportKeyPairScope,
      storageIdentities: [...new Set([primary.identity, permits.identity])],
    };
  };
}
