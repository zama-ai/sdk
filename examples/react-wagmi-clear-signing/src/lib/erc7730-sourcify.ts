import { resolve } from "node:path";
import {
  format,
  type DisplayModel,
  type ExternalDataProvider,
  type RegistryIndex,
} from "@ethereum-sourcify/clear-signing";
import { getAddress, isAddress, type Address, type Hex } from "viem";

const ZAMAMOCK_ADDRESS = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";
const CZAMAMOCK_ADDRESS = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB";
const SEPOLIA_CHAIN_ID = 11155111;

const TOKENS: Record<string, { name: string; symbol: string; decimals: number }> = {
  [ZAMAMOCK_ADDRESS.toLowerCase()]: {
    name: "ZAMAMock",
    symbol: "ZAMAMock",
    decimals: 18,
  },
};

const SOURCIFY_INDEX: RegistryIndex = {
  calldataIndex: {
    [`eip155:${SEPOLIA_CHAIN_ID}:${ZAMAMOCK_ADDRESS.toLowerCase()}`]:
      "calldata-zamamock-sepolia.mjs",
    [`eip155:${SEPOLIA_CHAIN_ID}:${CZAMAMOCK_ADDRESS.toLowerCase()}`]:
      "calldata-czamamock-sepolia.mjs",
  },
  typedDataIndex: {},
};

const SOURCIFY_DESCRIPTOR_DIR = resolve(process.cwd(), "src/lib/erc7730-descriptors");

const SOURCIFY_EXTERNAL_DATA_PROVIDER: ExternalDataProvider = {
  resolveToken: async (_chainId, address) => TOKENS[address.toLowerCase()] ?? null,
  resolveLocalName: async (address) => ({
    name: isAddress(address) ? getAddress(address as Address) : address,
    typeMatch: true,
  }),
  resolveEnsName: async () => null,
};

export interface Erc7730RenderRequestCall {
  label?: string;
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
}

export interface Erc7730RenderResult {
  label: string;
  chainId: number;
  to: Address;
  status: "matched" | "review" | "not-covered" | "failed";
  message?: string;
  model?: DisplayModel;
}

export async function renderLocalErc7730Call(
  call: Erc7730RenderRequestCall,
  index: number,
): Promise<Erc7730RenderResult> {
  try {
    const model = await format(
      {
        chainId: call.chainId,
        to: getAddress(call.to),
        data: call.data,
        value: call.value === undefined ? 0n : BigInt(call.value),
      },
      {
        descriptorResolverOptions: {
          type: "embedded",
          index: SOURCIFY_INDEX,
          descriptorDirectory: SOURCIFY_DESCRIPTOR_DIR,
        },
        externalDataProvider: SOURCIFY_EXTERNAL_DATA_PROVIDER,
      },
    );
    if (hasNoDescriptorWarning(model)) {
      return {
        label: call.label ?? `Transaction ${index + 1}`,
        chainId: call.chainId,
        to: getAddress(call.to),
        status: "not-covered",
        message:
          "No local ERC-7730 descriptor covers this contract address yet. The current registry-ready runtime preview covers ZAMAMock / cZAMAMock shield transactions.",
      };
    }
    const warnings = model.warnings ?? [];
    return {
      label: call.label ?? `Transaction ${index + 1}`,
      chainId: call.chainId,
      to: getAddress(call.to),
      status: warnings.length === 0 ? "matched" : "review",
      message: warnings.length === 0 ? undefined : "Sourcify rendered with warnings.",
      model,
    };
  } catch (error) {
    return {
      label: call.label ?? `Transaction ${index + 1}`,
      chainId: call.chainId,
      to: getAddress(call.to),
      status: "failed",
      message: error instanceof Error ? error.message : "Sourcify rendering failed.",
    };
  }
}

function hasNoDescriptorWarning(model: DisplayModel): boolean {
  return (
    model.warnings?.some(
      (warning) =>
        warning.code === "NO_DESCRIPTOR" || warning.message.includes("No descriptor found"),
    ) ?? false
  );
}
