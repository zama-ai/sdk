import {
  chains as presets,
  ConfigurationError,
  type FheChain,
  type ZamaConfigBase,
} from "@zama-fhe/sdk";

const supportedOptions = [
  "permitTTL",
  "transportKeyPairTTL",
  "transportKeyPairScope",
  "registryTTL",
] as const satisfies readonly (keyof ZamaConfigBase)[];
type CredentialOptions = Pick<ZamaConfigBase, (typeof supportedOptions)[number]>;
const supportedOptionNames: ReadonlySet<string> = new Set(supportedOptions);
type HttpChain = Omit<FheChain, "network"> & { network: string };
export interface ContextConfig extends CredentialOptions {
  chains: [HttpChain, ...HttpChain[]];
  chainId: number;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationError("Context configuration must be an object.");
  }
  return value as Record<string, unknown>;
}

function chain(value: unknown): HttpChain {
  const entry = object(value);
  if (typeof entry.id !== "number") {
    throw new ConfigurationError("A chain ID is required.");
  }
  const merged = { ...presets[entry.id], ...entry };
  if (typeof merged.network !== "string") {
    throw new ConfigurationError("A chain network must be an RPC URL string.");
  }
  return merged as HttpChain;
}

export function parseContextConfig(json: string): ContextConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ConfigurationError("Invalid context configuration JSON.");
  }
  const entry = object(parsed);
  const { chains: configuredChains, chainId: initialChain, rpcUrl, auth, ...options } = entry;
  if (Object.keys(options).some((key) => !supportedOptionNames.has(key))) {
    throw new ConfigurationError("Unsupported context configuration option.");
  }
  if (
    configuredChains !== undefined &&
    (!Array.isArray(configuredChains) || rpcUrl !== undefined || auth !== undefined)
  ) {
    throw new ConfigurationError("Use chains or the chainId/rpcUrl shorthand.");
  }
  const chains =
    configuredChains === undefined
      ? [
          chain({
            id: initialChain,
            ...(rpcUrl === undefined ? {} : { network: rpcUrl }),
            ...(auth === undefined ? {} : { auth }),
          }),
        ]
      : (configuredChains as unknown[]).map(chain);
  const selected = chains.find((item) => item.id === (initialChain ?? chains[0]?.id));
  if (!selected) {
    throw new ConfigurationError("Initial chain must be configured.");
  }
  return {
    ...options,
    chains: [selected, ...chains.filter((item) => item !== selected)],
    chainId: selected.id,
  } as ContextConfig;
}
