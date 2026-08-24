// oxlint-disable no-empty-pattern no-console
import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import type { Provider } from "ethers";
import { JsonRpcProvider } from "ethers";
import { getAddress, isHash, type Hex } from "viem";
import type { EIP712TypedData } from "../../relayer/types";
import * as z from "zod/mini";
import { sepolia } from "../../chains";
import { createConfig } from "../../config/create";
import { EthersProvider } from "../../ethers/ethers-provider";
import { node } from "../../node";
import { evmAddress } from "../../schemas/primitives";
import { BaseSigner } from "../../signer/base-signer";
import { MemoryStorage } from "../../storage/memory-storage";
import { describe, expect, test } from "../../test-fixtures";
import type { WalletAccount } from "../../types";
import { assertNonNullable } from "../../utils";
import { ZamaSDK } from "../../zama-sdk";

/**
 * A signer that can only report the connected DFNS wallet's address —
 * `preparePermit`/`registerPermit` never call into it (they take `signer` as
 * an explicit address), so it only exists to let `sdk.permits.hasPermit()`
 * resolve "the connected wallet" when verifying the registered permit.
 */
class VerificationOnlySigner extends BaseSigner {
  signTypedData(): Promise<Hex> {
    throw new Error("VerificationOnlySigner cannot sign — DFNS is the out-of-process signer here.");
  }
  writeContract(): Promise<Hex> {
    throw new Error(
      "VerificationOnlySigner cannot write — DFNS is the out-of-process signer here.",
    );
  }
}

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

interface BroadcastResult {
  txHash: string;
}

interface DfnsFixtures {
  env: Env;
  sdk: ZamaSDK;
  ethProvider: JsonRpcProvider;
  dfnsClient: DfnsApiClient;
  dfnsAccount: WalletAccount;
  signAndBroadcast: (unsignedTx: Hex) => Promise<BroadcastResult>;
  signTypedData: (typedData: EIP712TypedData) => Promise<Hex>;
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
    const wallet = await dfnsClient.wallets.getWallet({ walletId: env.DFNS_WALLET_ID });
    assertNonNullable(
      wallet.address,
      `dfnsClient.wallets.getWallet(${env.DFNS_WALLET_ID}).address`,
    );
    const network = await ethProvider.getNetwork();
    await use({ address: getAddress(wallet.address), chainId: Number(network.chainId) });
  },
  sdk: async ({ ethProvider, dfnsAccount }, use) => {
    const config = createConfig({
      chains: [sepolia] as const,
      relayers: { [sepolia.id]: node() },
      provider: new EthersProvider({ provider: ethProvider as unknown as Provider }),
      signer: new VerificationOnlySigner(dfnsAccount),
      storage: new MemoryStorage(),
    });
    const sdk = new ZamaSDK(config);
    await use(sdk);
    sdk.terminate();
  },
  signAndBroadcast: async ({ env, dfnsClient }, use) => {
    const walletId = env.DFNS_WALLET_ID;
    const dashboardBase = (env.DFNS_DASHBOARD_URL ?? "https://app.dfns.io").replace(/\/$/, "");

    await use(async (unsignedTx) => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      // DFNS signs (behind policy approval) AND publishes to the network in a
      // single call — hand it the SDK's unsigned tx and it self-broadcasts via
      // its own infra. This is the cross-process custody contract: the SDK
      // never holds key material and never touches the network to send.
      // Structural union — `snap` is the broadcast response first, then the
      // getTransaction snapshots; both carry id/status/txHash/reason.
      let snap = await dfnsClient.wallets.broadcastTransaction({
        walletId,
        body: { kind: "Transaction", transaction: unsignedTx },
      });

      const isBroadcast = (s: typeof snap) =>
        s.status === "Broadcasted" || s.status === "Confirmed";

      if (!isBroadcast(snap)) {
        console.log(
          `\n[DFNS] Transaction ${snap.id} is "${snap.status}". Approve in dashboard:\n` +
            `  ${dashboardBase}/wallets/${walletId}/transactions/${snap.id}\n`,
        );
      }

      while (!isBroadcast(snap)) {
        if (snap.status === "Failed" || snap.status === "Rejected") {
          throw new Error(
            `DFNS transaction ${snap.id} ended as ${snap.status}: ${snap.reason ?? "no reason"}`,
          );
        }
        if (Date.now() > deadline) {
          throw new Error(
            `DFNS transaction ${snap.id} did not broadcast within ${POLL_TIMEOUT_MS}ms (status=${snap.status})`,
          );
        }
        await sleep(POLL_INTERVAL_MS);
        snap = await dfnsClient.wallets.getTransaction({ walletId, transactionId: snap.id });
      }

      if (!snap.txHash) {
        throw new Error(`DFNS transaction ${snap.id} is ${snap.status} but returned no txHash`);
      }
      return { txHash: snap.txHash };
    });
  },
  signTypedData: async ({ env, dfnsClient }, use) => {
    const walletId = env.DFNS_WALLET_ID;
    const dashboardBase = (env.DFNS_DASHBOARD_URL ?? "https://app.dfns.io").replace(/\/$/, "");

    await use(async (typedData) => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      // DFNS's raw eth_signTypedData_v4 endpoint — a genuine out-of-process signer
      // call, not the SDK's GenericSigner abstraction. This is the exact contract
      // preparePermit hands a custody partner: sign `prepared.eip712` and return
      // the 65-byte signature, nothing else.
      let snap: { id: string; status: string; reason?: string; signature?: { encoded?: string } } =
        await dfnsClient.wallets.generateSignature({
          walletId,
          body: {
            kind: "Eip712",
            // DFNS's typed-data body wants mutable arrays; `EIP712TypedData`
            // (`@fhevm/sdk`'s `Eip712Like`) declares them readonly. The runtime
            // value is a plain object either way — only the type differs.
            types: typedData.types as Record<string, { name: string; type: string }[]>,
            domain: typedData.domain,
            message: typedData.message,
          },
        });

      const isSigned = (s: typeof snap) => s.status === "Signed" || s.status === "Confirmed";

      if (!isSigned(snap)) {
        console.log(
          `\n[DFNS] Signature ${snap.id} is "${snap.status}". Approve in dashboard:\n` +
            `  ${dashboardBase}/wallets/${walletId}/signatures/${snap.id}\n`,
        );
      }

      while (!isSigned(snap)) {
        if (snap.status === "Failed" || snap.status === "Rejected") {
          throw new Error(
            `DFNS signature ${snap.id} ended as ${snap.status}: ${snap.reason ?? "no reason"}`,
          );
        }
        if (Date.now() > deadline) {
          throw new Error(
            `DFNS signature ${snap.id} did not complete within ${POLL_TIMEOUT_MS}ms (status=${snap.status})`,
          );
        }
        await sleep(POLL_INTERVAL_MS);
        snap = await dfnsClient.wallets.getSignature({ walletId, signatureId: snap.id });
      }

      const encoded = snap.signature?.encoded;
      if (!encoded) {
        throw new Error(`DFNS signature ${snap.id} is ${snap.status} but returned no signature`);
      }
      return encoded as Hex;
    });
  },
});

describe.skipIf(env === null)("Integration: DFNS offline signing on Sepolia", () => {
  dfns(
    "prepare → DFNS signs (policy approval) and broadcasts, yielding a mined, successful tx",
    async ({ sdk, dfnsAccount, signAndBroadcast, ethProvider, env }) => {
      const prepared = await sdk.offline.prepare({
        kind: "ConfidentialTransfer",
        from: dfnsAccount.address,
        token: env.TOKEN_ADDRESS,
        to: env.RECIPIENT_ADDRESS,
        amount: 1n * 10n ** 6n,
      });
      expect(prepared.unsignedTx).toMatch(/^0x[0-9a-f]+$/i);

      // The custodian owns signing AND broadcast — the SDK's job ended at
      // `prepare`. A real tx hash back proves the cross-process round-trip.
      const { txHash } = await signAndBroadcast(prepared.unsignedTx);
      expect(isHash(txHash)).toBe(true);

      // A broadcast hash alone doesn't prove success — the tx can still revert
      // on-chain (status 0). Wait on the raw ethers provider for the receipt and
      // assert it succeeded. (The SDK's GenericProvider receipt carries only
      // `logs`, not `status`, so we go to the underlying provider here.)
      const receipt = await ethProvider.waitForTransaction(txHash, 1, POLL_TIMEOUT_MS);
      assertNonNullable(receipt, `receipt for ${txHash}`);
      expect(receipt.status).toBe(1);
    },
    POLL_TIMEOUT_MS + 60_000,
  );

  dfns(
    "preparePermit → DFNS signs (policy approval) → registerPermit yields a usable permit",
    async ({ sdk, dfnsAccount, signTypedData, env }) => {
      const prepared = await sdk.offline.preparePermit({
        signer: dfnsAccount.address,
        contracts: [env.TOKEN_ADDRESS],
      });
      expect(prepared.version).toBe(1);
      expect(prepared.signerAddress).toBe(getAddress(dfnsAccount.address));

      // The custodian's only job is to sign `prepared.eip712` — nothing else
      // changes about the payload. This is the exact contract the DFNS
      // integration was waiting on.
      const signature = await signTypedData(prepared.eip712);
      expect(signature).toMatch(/^0x[0-9a-f]+$/i);

      expect(await sdk.permits.hasPermit([env.TOKEN_ADDRESS])).toBe(false);
      await sdk.permits.registerPermit(prepared, signature);
      expect(await sdk.permits.hasPermit([env.TOKEN_ADDRESS])).toBe(true);
    },
    POLL_TIMEOUT_MS + 60_000,
  );
});
