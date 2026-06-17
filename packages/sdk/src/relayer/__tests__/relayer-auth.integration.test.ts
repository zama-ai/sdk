import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet as viemMainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import type { Auth } from "@zama-fhe/relayer-sdk/bundle";
import { type EncryptedValue, MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { mainnet, type FheChain } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";

// Live tests against the hosted mainnet relayer. OFF by default so the offline
// `pnpm test:integration` run stays green; also needs the built worker bundle:
//   pnpm build:sdk
//   ENABLE_RELAYER_AUTH_TESTS=true pnpm test:integration
// Negative cases need NO real key; the positive case needs ZAMA_RELAYER_API_KEY.
const RUN = process.env.ENABLE_RELAYER_AUTH_TESTS === "true";

const HANDLE =
  "0x83c5dae9465be5dc53e7582b5cd5aaa35360b19cc7ff00000000000000010500" as EncryptedValue;

// Public decrypt never signs, but the viem config requires a wallet client.
const THROWAWAY_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function makeSdk(auth?: Auth): ZamaSDK {
  const transport = http(process.env.MAINNET_RPC_URL);
  const publicClient = createPublicClient({ chain: viemMainnet, transport });
  const walletClient = createWalletClient({
    account: privateKeyToAccount(THROWAWAY_KEY),
    chain: viemMainnet,
    transport,
  });
  const chain = {
    ...mainnet,
    ...(auth ? { auth } : {}),
  } as const satisfies FheChain;
  const config = createConfig({
    chains: [chain],
    publicClient,
    walletClient,
    storage: new MemoryStorage(),
    relayers: { [chain.id]: node() },
  });
  return new ZamaSDK(config);
}

function messageChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(typeof current === "string" ? current : JSON.stringify(current));
      break;
    }
  }
  return parts.join(" | ");
}

describe.skipIf(!RUN)("relayer auth against the hosted mainnet relayer (live)", () => {
  const rejectedCases: Array<readonly [string, Auth | undefined]> = [
    ["ApiKeyCookie", { __type: "ApiKeyCookie", value: "not-a-real-key" }],
    ["BearerToken", { __type: "BearerToken", token: "not-a-real-key" }],
    ["no auth", undefined],
    ["ApiKeyHeader with a bogus key", { __type: "ApiKeyHeader", value: "not-a-real-key" }],
  ];

  it.each(rejectedCases)(
    "rejects %s and surfaces the relayer's error message",
    async (_label, auth) => {
      using sdk = makeSdk(auth);
      let caught: unknown;
      try {
        await sdk.decryption.decryptPublicValues([HANDLE]);
      } catch (error) {
        caught = error;
      }
      expect(caught, "expected the hosted relayer to reject this request").toBeDefined();
      const message = messageChain(caught);
      expect(message).toMatch(/x-api-key|api key|unauthorized|forbidden/i);
      expect(message).not.toMatch(/unexpected response status/i);
    },
  );

  it.skipIf(!process.env.ZAMA_RELAYER_API_KEY)(
    "accepts a valid ApiKeyHeader and returns a clear value",
    async () => {
      using sdk = makeSdk({
        __type: "ApiKeyHeader",
        value: process.env.ZAMA_RELAYER_API_KEY!,
      });
      const result = await sdk.decryption.decryptPublicValues([HANDLE]);
      expect(result.clearValues).toHaveProperty(HANDLE);
    },
  );
});
