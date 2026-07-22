import { ethers, BrowserProvider } from "ethers";
import type { ParamType } from "ethers";
import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  EIP1193Provider,
  Hex,
} from "viem";
import type { GenericProvider, ReadContractConfig, TransactionReceipt } from "../types";

/**
 * Bit width at or below which viem decodes a Solidity integer to `number` rather than `bigint`.
 * ethers v6 decodes *every* integer as a `bigint`, so {@link EthersProvider} narrows the small ones
 * to keep parity with `ViemProvider` — and with the return type both providers are declared
 * against. 48 bits stays well inside `Number.MAX_SAFE_INTEGER` (53 bits), which is why viem draws
 * the line there.
 */
const VIEM_NUMBER_INT_MAX_BITS = 48;

/**
 * Recursively coerce an ethers-decoded value to match how viem decodes the same output, walking
 * ethers' own parsed {@link ParamType} tree, so callers see identical shapes regardless of which
 * provider backs the SDK. The only real divergence is integers: viem narrows widths of
 * {@link VIEM_NUMBER_INT_MAX_BITS} bits or fewer to `number` (e.g. a token's `decimals`, a `uint8`),
 * whereas ethers hands back a `bigint`. Everything else — addresses, booleans, `bytes`, strings —
 * already decodes to compatible JS types in both.
 */
function toViemShape(value: unknown, param: ParamType): unknown {
  // Arrays (`T[]`, `T[3]`): normalize each element against the parsed element type.
  const { arrayChildren, components } = param;
  if (param.isArray() && arrayChildren && Array.isArray(value)) {
    return value.map((element) => toViemShape(element, arrayChildren));
  }

  // Tuples/structs: ethers returns an array-like `Result`; normalize each component positionally.
  if (param.isTuple() && components && Array.isArray(value)) {
    return components.map((component, index) =>
      toViemShape((value as unknown[])[index], component),
    );
  }

  // Integers: narrow the small widths viem decodes as `number`; leave the wide ones as `bigint`.
  const intMatch = /^u?int(\d+)$/.exec(param.type);
  if (intMatch && typeof value === "bigint") {
    return Number(intMatch[1]) <= VIEM_NUMBER_INT_MAX_BITS ? Number(value) : value;
  }

  return value;
}

/**
 * Configuration for {@link EthersProvider}.
 *
 * Two variants:
 *
 * - **EIP-1193** — `{ ethereum }`: pass the raw EIP-1193 provider (e.g. `window.ethereum`).
 *   A `BrowserProvider` is created internally.
 *
 * - **Pre-built** — `{ provider }`: pass any ethers `Provider`
 *   (e.g. `JsonRpcProvider`, `WebSocketProvider`).
 */
export type EthersProviderConfig = { ethereum: EIP1193Provider } | { provider: ethers.Provider };

/**
 * Read-only {@link GenericProvider} backed by ethers v6.
 *
 * Use this for integrations that only need public chain reads before the user has connected their
 * wallet.
 *
 * @example
 * ```ts
 * // Dedicated RPC
 * const provider = new EthersProvider({
 *   provider: new ethers.JsonRpcProvider(ALCHEMY_URL),
 * });
 *
 * // Wallet-sourced RPC (shares transport with EthersSigner)
 * const provider = new EthersProvider({ ethereum: window.ethereum });
 * ```
 */
export class EthersProvider implements GenericProvider {
  readonly #readProvider: ethers.Provider;

  constructor(config: EthersProviderConfig) {
    if ("ethereum" in config) {
      this.#readProvider = new BrowserProvider(config.ethereum);
    } else {
      this.#readProvider = config.provider;
    }
  }

  /** Return the chain ID of the connected network. */
  async getChainId(): Promise<number> {
    const network = await this.#readProvider.getNetwork();
    return Number(network.chainId);
  }

  /** Execute a read-only call and return the decoded result. */
  async readContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "pure" | "view">,
    const TArgs extends ContractFunctionArgs<TAbi, "pure" | "view", TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ContractFunctionReturnType<TAbi, "pure" | "view", TFunctionName, TArgs>> {
    const contract = new ethers.Contract(
      config.address,
      config.abi as ethers.InterfaceAbi,
      this.#readProvider,
    );
    const fn = contract.getFunction(config.functionName);
    const result = await fn(...(config.args as readonly unknown[]));

    // ethers decodes every integer as a `bigint`; reshape the result to match viem so both
    // providers honour the same return-type contract (e.g. `decimals` is a `number`, not a
    // `bigint`). ethers unwraps a single-output call to the bare value and returns an array-like
    // `Result` for multi-output ones — mirror that split when walking the parsed output types.
    const outputs = fn.fragment.outputs;
    const [firstOutput] = outputs;

    const fallback =
      outputs.length === 0
        ? result
        : outputs.map((output, index) => toViemShape((result as unknown[])[index], output));

    const normalized =
      outputs.length === 1 && firstOutput ? toViemShape(result, firstOutput) : fallback;

    return normalized satisfies ContractFunctionReturnType<
      TAbi,
      "pure" | "view",
      TFunctionName,
      TArgs
    >;
  }

  /** Return the latest block timestamp in seconds. */
  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.#readProvider.getBlock("latest");
    if (!block) {
      throw new Error("Failed to fetch latest block");
    }
    if (block.timestamp === null) {
      throw new Error("Latest block has no timestamp");
    }
    return BigInt(block.timestamp);
  }

  /** Wait for a transaction to be mined and return its receipt. */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    const receipt = await this.#readProvider.waitForTransaction(hash);
    if (!receipt) {
      throw new Error("Transaction receipt not found");
    }
    return {
      logs: receipt.logs.map((log) => ({
        topics: log.topics.filter((t): t is Hex => t !== null),
        data: log.data as Hex,
      })),
    };
  }
}
