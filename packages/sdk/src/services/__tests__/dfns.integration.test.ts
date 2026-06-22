// oxlint-disable no-empty-pattern no-console
import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import type { Provider } from "ethers";
import { JsonRpcProvider } from "ethers";
import { getAddress, type Hex } from "viem";
import * as z from "zod/mini";
import { sepolia } from "../../chains";
import { createConfig } from "../../config/create";
import { EthersProvider } from "../../ethers/ethers-provider";
import { node } from "../../node";
import type { EIP712TypedData } from "../../relayer/relayer-sdk.types";
import { MemoryStorage } from "../../storage/memory-storage";
import { describe, expect, test } from "../../test-fixtures";
import type { WalletAccount } from "../../types";
import { ZamaSDK } from "../../zama-sdk";
import { assertNonNullable } from "../../utils";
import { evmAddress } from "../../schemas/primitives";
import type { GenerateSignatureResponse, GetSignatureResponse } from "@dfns/sdk/generated/wallets";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Real DFNS (with policy approval) + real Sepolia + real FHEVM relayer.
// Demonstrates the canonical cross-process custody flow: SDK runs without
// a signer, the back-end signer service (here: the DFNS API client) is
// the only thing that holds key material, and the policy-engine approval
// happens out-of-band between `prepare` and `broadcast`.
//
// Default `pnpm test` excludes `*.integration.test.ts`. Run with:
//
//   pnpm test:integration packages/sdk/src/services/__tests__/dfns.integration.test.ts
//
// You'll be prompted to approve each signature in the DFNS dashboard.

const nonEmptyString = z.string().check(z.minLength(1));

const envSchema = z.object({
  DFNS_BASE_URL: z.url(),
  DFNS_AUTH_TOKEN: nonEmptyString,
  DFNS_CRED_ID: nonEmptyString,
  DFNS_PRIVATE_KEY: z.pipe(
    nonEmptyString,
    z.transform((s) => s.replace(/\\n/g, "\n")),
  ),
  DFNS_WALLET_ID: nonEmptyString,
  DFNS_ORG_ID: nonEmptyString,
  DFNS_DASHBOARD_URL: z.optional(z.url()),
  SEPOLIA_RPC_URL: z.url(),
  TOKEN_ADDRESS: evmAddress,
  RECIPIENT_ADDRESS: evmAddress,
});

const envParsed = z.safeParse(envSchema, process.env);
const env = envParsed.success ? envParsed.data : null;
if (!envParsed.success) {
  const reason = envParsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.warn(
    `[dfns.integration] Skipping DFNS integration suite — env validation failed:\n${reason}`,
  );
}

type Env = NonNullable<typeof env>;

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

type GenerateSignatureBody = NonNullable<
  Parameters<DfnsApiClient["wallets"]["generateSignature"]>[0]
>["body"];

interface PolledSignature {
  signedData?: string;
  signatureEncoded?: string;
}

interface DfnsFixtures {
  env: Env;
  sdk: ZamaSDK;
  ethProvider: JsonRpcProvider;
  dfnsClient: DfnsApiClient;
  dfnsAccount: WalletAccount;
  pollDfnsSignature: (body: GenerateSignatureBody) => Promise<PolledSignature>;
}

const dfns = test.extend<DfnsFixtures>({
  env: async ({}, use) => {
    assertNonNullable(env, "env");
    await use(env);
  },
  ethProvider: async ({ env }, use) => {
    const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL);
    await use(provider);
    provider.destroy();
  },
  dfnsClient: async ({ env }, use) => {
    const keySigner = new AsymmetricKeySigner({
      credId: env.DFNS_CRED_ID,
      privateKey: env.DFNS_PRIVATE_KEY,
    });
    const client = new DfnsApiClient({
      orgId: env.DFNS_ORG_ID,
      authToken: env.DFNS_AUTH_TOKEN,
      baseUrl: env.DFNS_BASE_URL,
      signer: keySigner,
    });
    await use(client);
  },
  dfnsAccount: async ({ env, dfnsClient, ethProvider }, use) => {
    const wallet = await dfnsClient.wallets.getWallet({
      walletId: env.DFNS_WALLET_ID,
    });
    assertNonNullable(
      wallet.address,
      `dfnsClient.wallets.getWallet(${env.DFNS_WALLET_ID}).address`,
    );
    const network = await ethProvider.getNetwork();
    await use({
      address: getAddress(wallet.address),
      chainId: Number(network.chainId),
    });
  },
  sdk: async ({ ethProvider }, use) => {
    const provider = new EthersProvider({
      provider: ethProvider as unknown as Provider,
    });
    const config = createConfig({
      chains: [sepolia] as const,
      relayers: { [sepolia.id]: node() },
      provider,
      storage: new MemoryStorage(),
    });
    const sdk = new ZamaSDK(config);
    await use(sdk);
    sdk.terminate();
  },
  pollDfnsSignature: async ({ env, dfnsClient }, use) => {
    const walletId = env.DFNS_WALLET_ID;
    const dashboardBase = (env.DFNS_DASHBOARD_URL ?? "https://app.dfns.io").replace(/\/$/, "");

    await use(async (body) => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      // Structural snapshot — sidesteps the GenerateSignatureResponse vs
      // GetSignatureResponse nominal mismatch (only the former has walletId).
      // oxlint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      let snap: GenerateSignatureResponse | GetSignatureResponse =
        await dfnsClient.wallets.generateSignature({ walletId, body });

      if (snap.status !== "Signed") {
        console.log(
          `\n[DFNS] Signature ${snap.id} is "${snap.status}". Approve in dashboard:\n` +
            `  ${dashboardBase}/wallets/${walletId}/signatures/${snap.id}\n`,
        );
      }

      while (snap.status !== "Signed") {
        if (snap.status === "Failed" || snap.status === "Rejected") {
          throw new Error(
            `DFNS signature ${snap.id} ended as ${snap.status}: ${snap.reason ?? "no reason"}`,
          );
        }
        if (Date.now() > deadline) {
          throw new Error(
            `DFNS signature ${snap.id} did not resolve within ${POLL_TIMEOUT_MS}ms (status=${snap.status})`,
          );
        }
        await sleep(POLL_INTERVAL_MS);
        snap = await dfnsClient.wallets.getSignature({
          walletId,
          signatureId: snap.id,
        });
      }

      return {
        signedData: snap.signedData,
        signatureEncoded: snap.signature?.encoded,
      };
    });
  },
});

describe.skipIf(env === null)("Integration: DFNS offline signing on Sepolia", () => {
  dfns(
    "prepare → DFNS async sign (policy approval) → broadcast",
    async ({ sdk, dfnsAccount, pollDfnsSignature, env }) => {
      const prepared = await sdk.offlineSigning.prepare({
        kind: "ConfidentialTransfer",
        from: dfnsAccount.address,
        token: env.TOKEN_ADDRESS,
        to: env.RECIPIENT_ADDRESS,
        amount: 1n * 10n ** 6n,
      });
      expect(prepared.unsignedTx).toMatch(/^0x[0-9a-f]+$/i);

      const { signedData } = await pollDfnsSignature({
        kind: "Transaction",
        transaction: prepared.unsignedTx,
      });
      if (!signedData) {
        throw new Error("DFNS returned no signedData for Transaction signing");
      }
      const signedTx = signedData as Hex;
      expect(signedTx).toMatch(/^0x[0-9a-f]+$/i);

      const result = await sdk.offlineSigning.broadcast(prepared, signedTx);
      expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(result.receipt.logs).toBeInstanceOf(Array);
    },
    POLL_TIMEOUT_MS + 60_000,
  );

  dfns(
    "prepare → DFNS async signTypedData (policy approval) → registerPermit",
    async ({ sdk, pollDfnsSignature, dfnsAccount, env }) => {
      const prepared = await sdk.offlineSigning.prepare({
        kind: "DecryptionPermit",
        from: dfnsAccount.address,
        contracts: [env.TOKEN_ADDRESS],
      });

      if (prepared.typedData === null) {
        const cached = await sdk.offlineSigning.registerPermit(prepared, "0x" as Hex);
        expect(cached.contracts).toEqual(prepared.context.chunk);
        return;
      }

      const { domain, types, message } = prepared.typedData as unknown as EIP712TypedData & {
        domain: {
          name?: string;
          version?: string;
          chainId: bigint;
          verifyingContract?: string;
        };
        types: Record<string, readonly { name: string; type: string }[]>;
        message: Record<string, unknown>;
      };
      const eip712Types: Record<string, { name: string; type: string }[]> = {};
      for (const [k, v] of Object.entries(types)) {
        if (k === "EIP712Domain") {
          continue;
        }
        eip712Types[k] = [...v];
      }

      const { signatureEncoded } = await pollDfnsSignature({
        kind: "Eip712",
        types: eip712Types,
        domain: {
          ...(domain.name && { name: domain.name }),
          ...(domain.version && { version: domain.version }),
          ...(domain.chainId !== undefined && {
            chainId: Number(domain.chainId),
          }),
          ...(domain.verifyingContract && {
            verifyingContract: domain.verifyingContract,
          }),
        },
        message,
      });
      if (!signatureEncoded) {
        throw new Error("DFNS returned no signature.encoded for Eip712 signing");
      }
      const sig = signatureEncoded as Hex;
      expect(sig).toMatch(/^0x[0-9a-f]{130}$/i);

      const registered = await sdk.offlineSigning.registerPermit(prepared, sig);
      expect(registered.contracts.length).toBeGreaterThan(0);
      expect(registered.durationDays).toBeGreaterThan(0);
    },
    POLL_TIMEOUT_MS + 60_000,
  );
});
