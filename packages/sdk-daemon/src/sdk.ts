import {
  createConfig,
  ZamaSDK,
  ConfigurationError,
  type GenericProvider,
  type ZamaConfig,
} from "@zama-fhe/sdk";
import { ClientLanguage } from "./generated/zama/sdk/v1beta1/daemon.js";
import { createHttpProvider } from "./provider.js";
import type { StorageManager } from "./storage-manager.js";
import { parseContextConfig } from "./sdk-config.js";
import type { ContextFactory } from "./runtime.js";
import { diagnosticsLogger } from "./diagnostics.js";

/** The published typings strip the internal `telemetry` field. */
type MarkableConfig = ZamaConfig & {
  telemetry:
    | { runtime?: "web" | "node" | "daemon"; client?: "go" | "rust" | "unknown" }
    | undefined;
};

function telemetryClient(language: ClientLanguage): "go" | "rust" | "unknown" {
  switch (language) {
    case ClientLanguage.CLIENT_LANGUAGE_GO:
      return "go";
    case ClientLanguage.CLIENT_LANGUAGE_RUST:
      return "rust";
    case ClientLanguage.CLIENT_LANGUAGE_UNSPECIFIED:
      return "unknown";
    default:
      language satisfies ClientLanguage.UNRECOGNIZED;
      return "unknown";
  }
}

export function markDaemonTelemetry(config: ZamaConfig, language: ClientLanguage): void {
  const { telemetry } = config as MarkableConfig;
  if (telemetry) {
    telemetry.runtime = "daemon";
    telemetry.client = telemetryClient(language);
  }
}

export function createContextFactory(manager: StorageManager): ContextFactory {
  return async (request, signer, remote, events) => {
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
      getBlockTimestamp: (readChainId) => current().getBlockTimestamp(readChainId),
      prepareTransaction: (args) => current().prepareTransaction(args),
    };
    const secret = request.transportKeyPairDerivationSecret;
    const value = secret?.value;
    const config = createConfig({
      chains,
      signer,
      provider,
      storage: primary.storage,
      permitStorage: permits.storage,
      logger: diagnosticsLogger,
      ...options,
      onEvent: events.onEvent,
    });
    markDaemonTelemetry(config, request.clientLanguage);
    const sdk = new ZamaSDK(
      config,
      // Presence with undefined enables protection; omission leaves the SDK option absent.
      secret === undefined
        ? {}
        : { transportKeyPairDerivationSecret: value?.$case === "text" ? value.text : value?.bytes },
    );
    events.observeWallet(sdk);
    return {
      sdk,
      credentialScope: options.transportKeyPairScope,
      storageIdentities: [...new Set([primary.identity, permits.identity])],
    };
  };
}
