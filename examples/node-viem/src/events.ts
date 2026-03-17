/**
 * Events example: subscribe to SDK lifecycle events for progress tracking.
 *
 * Usage: PRIVATE_KEY=0x... TOKEN_ADDRESS=0x... COORDINATOR_ADDRESS=0x... RECIPIENT=0x... npx tsx src/events.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK, ZamaSDKEvents, type Address } from "@zama-fhe/sdk";
import type { ZamaSDKEvent } from "@zama-fhe/sdk";
import { ViemSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/viem";
import { RelayerNode } from "@zama-fhe/sdk/node";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;
const RECIPIENT = process.env.RECIPIENT as Address;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });

  const signer = new ViemSigner({ walletClient, publicClient });
  const authConfig = { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      [mainnet.id]: { network: MAINNET_RPC_URL, auth: authConfig },
      [sepolia.id]: { network: SEPOLIA_RPC_URL, auth: authConfig },
    },
  });

  // Pass an onEvent callback to track all SDK lifecycle events
  const storage = new MemoryStorage();
  const sdk = new ZamaSDK({
    relayer,
    signer,
    storage,
    onEvent: (event: ZamaSDKEvent) => {
      const ts = new Date(event.timestamp).toISOString();
      switch (event.type) {
        // Credential lifecycle
        case ZamaSDKEvents.CredentialsLoading:
          console.log(`[${ts}] Loading cached credentials...`);
          break;
        case ZamaSDKEvents.CredentialsCached:
          console.log(`[${ts}] Credentials loaded from cache`);
          break;
        case ZamaSDKEvents.CredentialsCreating:
          console.log(`[${ts}] Creating new credentials (wallet signature required)...`);
          break;
        case ZamaSDKEvents.CredentialsCreated:
          console.log(`[${ts}] Credentials created and cached`);
          break;
        case ZamaSDKEvents.CredentialsExpired:
          console.log(`[${ts}] Credentials expired — will re-create on next operation`);
          break;
        case ZamaSDKEvents.CredentialsRevoked:
          console.log(`[${ts}] Credentials revoked`);
          break;

        // FHE operations
        case ZamaSDKEvents.EncryptStart:
          console.log(`[${ts}] Encrypting...`);
          break;
        case ZamaSDKEvents.EncryptEnd:
          console.log(`[${ts}] Encryption complete`);
          break;
        case ZamaSDKEvents.DecryptStart:
          console.log(`[${ts}] Decrypting...`);
          break;
        case ZamaSDKEvents.DecryptEnd:
          console.log(`[${ts}] Decryption complete`);
          break;

        // Transaction events
        case ZamaSDKEvents.ShieldSubmitted:
          console.log(`[${ts}] Shield tx submitted: ${event.txHash}`);
          break;
        case ZamaSDKEvents.TransferSubmitted:
          console.log(`[${ts}] Transfer tx submitted: ${event.txHash}`);
          break;
        case ZamaSDKEvents.UnwrapSubmitted:
          console.log(`[${ts}] Unwrap tx submitted: ${event.txHash}`);
          break;
        case ZamaSDKEvents.FinalizeUnwrapSubmitted:
          console.log(`[${ts}] Finalize unwrap tx submitted: ${event.txHash}`);
          break;

        // Unshield phases
        case ZamaSDKEvents.UnshieldPhase1Submitted:
          console.log(`[${ts}] Unshield phase 1 submitted: ${event.txHash}`);
          break;
        case ZamaSDKEvents.UnshieldPhase2Started:
          console.log(`[${ts}] Unshield phase 2 started (decrypting burn proof)...`);
          break;
        case ZamaSDKEvents.UnshieldPhase2Submitted:
          console.log(`[${ts}] Unshield phase 2 submitted: ${event.txHash}`);
          break;

        // Errors
        case ZamaSDKEvents.TransactionError:
          console.error(`[${ts}] Transaction error in ${event.operation}:`, event.error.message);
          break;
        case ZamaSDKEvents.EncryptError:
          console.error(`[${ts}] Encryption error:`, event.error.message);
          break;
        case ZamaSDKEvents.DecryptError:
          console.error(`[${ts}] Decryption error:`, event.error.message);
          break;

        default:
          console.log(`[${ts}] ${event.type}`);
      }
    },
  });

  const wrapperAddress = await readWrapperForTokenContract(
    publicClient,
    COORDINATOR_ADDRESS,
    TOKEN_ADDRESS,
  );
  const token = sdk.createToken(TOKEN_ADDRESS, wrapperAddress);

  try {
    console.log("=== Decrypt balance (triggers credential lifecycle) ===\n");
    const balance = await token.balanceOf();
    console.log(`\nBalance: ${balance}\n`);

    console.log("=== Shield 100 tokens (triggers encrypt + tx events) ===\n");
    await token.shield(100n);

    console.log("\n=== Transfer 50 tokens (triggers encrypt + tx events) ===\n");
    await token.confidentialTransfer(RECIPIENT, 50n);

    console.log("\n=== Unshield 25 tokens (triggers 2-phase unshield events) ===\n");
    await token.unshield(25n);

    console.log("\n=== Done ===");
  } finally {
    sdk.terminate();
  }
}

main().catch(console.error);
