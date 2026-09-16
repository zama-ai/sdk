import { createConfig, ZamaSDK, ConfigurationError, type GenericProvider } from "@zama-fhe/sdk";
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
    const { chains, chainId, providerConfigs, ...options } = parseContextConfig(request.config);
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
    const secret = request.transportKeyPairDerivationSecret;
    const value = secret?.value;
    const sdk = new ZamaSDK(
      createConfig({
        chains,
        signer,
        provider,
        storage: primary.storage,
        permitStorage: permits.storage,
        logger: {
          warn: (message) => {
            process.stderr.write(`${message}\n`);
          },
          error: () => {},
          info: () => {},
          debug: () => {},
        },
        ...options,
      }),
      // Presence with undefined enables protection; omission leaves the SDK option absent.
      secret === undefined
        ? {}
        : { transportKeyPairDerivationSecret: value?.$case === "text" ? value.text : value?.bytes },
    );
    return {
      sdk,
      credentialScope: options.transportKeyPairScope,
      storageIdentities: [...new Set([primary.identity, permits.identity])],
    };
  };
}
