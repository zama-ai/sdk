/** Live-network test because mocks cannot reject input proofs bound to the wrong `msg.sender`. */
import { MemoryStorage, ZamaSDK, type Address, type Hex } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const OWNER_PRIVATE_KEY = process.env.SEPOLIA_OWNER_PRIVATE_KEY;
const OPERATOR_PRIVATE_KEY = process.env.SEPOLIA_OPERATOR_PRIVATE_KEY;

const CONFIDENTIAL_TOKEN_ADDRESS = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address;

/** Smallest observable debit, so the test barely moves the owner's balance. */
const TRANSFER_AMOUNT = 1n;

/** Operator approval window, wide enough to outlive the transfer transaction. */
const OPERATOR_APPROVAL_SECONDS = 3600;

/** Encrypt plus two transactions plus two decryptions exceed the 30s default. */
const FLOW_TIMEOUT_MS = 300_000;

// Use one signer-bound SDK per wallet so each operation binds proofs to its caller.
function setupWallets(ownerPrivateKey: Hex, operatorPrivateKey: Hex) {
  const ownerAccount = privateKeyToAccount(ownerPrivateKey);
  const operatorAccount = privateKeyToAccount(operatorPrivateKey);

  const rpc = process.env.SEPOLIA_RPC_URL ?? sepolia.network;
  const transport = typeof rpc === "string" ? http(rpc) : custom(rpc);
  const publicClient = createPublicClient({ transport });

  const sdkFor = (account: typeof ownerAccount) =>
    new ZamaSDK(
      createConfig({
        chains: [sepolia],
        publicClient,
        walletClient: createWalletClient({ account, transport }),
        storage: new MemoryStorage(),
        relayers: { [sepolia.id]: node() },
      }),
    );

  const ownerSdk = sdkFor(ownerAccount);
  const operatorSdk = sdkFor(operatorAccount);

  return {
    ownerAccount,
    operatorAccount,
    ownerSdk,
    operatorSdk,
    ownerToken: ownerSdk.createToken(CONFIDENTIAL_TOKEN_ADDRESS),
    operatorToken: operatorSdk.createToken(CONFIDENTIAL_TOKEN_ADDRESS),
    // The SDK receipt only exposes logs, so read status back over RPC.
    receiptStatus: async (txHash: Hex) =>
      (await publicClient.getTransactionReceipt({ hash: txHash })).status,
  };
}

describe.skipIf(!OWNER_PRIVATE_KEY || !OPERATOR_PRIVATE_KEY)(
  "Sepolia operator confidentialTransferFrom (funded wallets)",
  () => {
    // Vitest still evaluates a skipped describe body, so wallets and SDKs are
    // built lazily in beforeAll where the private keys are known to be set.
    let wallets: ReturnType<typeof setupWallets>;

    beforeAll(() => {
      wallets = setupWallets(OWNER_PRIVATE_KEY as Hex, OPERATOR_PRIVATE_KEY as Hex);
    });

    afterAll(() => {
      wallets?.ownerSdk.terminate();
      wallets?.operatorSdk.terminate();
    });

    test(
      "debits the owner when the approved operator transfers on its behalf",
      { timeout: FLOW_TIMEOUT_MS },
      async () => {
        const { ownerAccount, operatorAccount, ownerToken, operatorToken, receiptStatus } = wallets;

        const balanceBefore = await ownerToken.balanceOf(ownerAccount.address);
        expect(balanceBefore).toBeGreaterThanOrEqual(TRANSFER_AMOUNT);

        const approval = await ownerToken.setOperator(
          operatorAccount.address,
          Math.floor(Date.now() / 1000) + OPERATOR_APPROVAL_SECONDS,
        );
        expect(await receiptStatus(approval.txHash)).toBe("success");
        expect(await ownerToken.isOperator(ownerAccount.address, operatorAccount.address)).toBe(
          true,
        );

        // The operator is also the recipient, so no third funded wallet is needed.
        const transfer = await operatorToken.confidentialTransferFrom(
          ownerAccount.address,
          operatorAccount.address,
          TRANSFER_AMOUNT,
        );
        expect(await receiptStatus(transfer.txHash)).toBe("success");

        const balanceAfter = await ownerToken.balanceOf(ownerAccount.address);
        expect(balanceAfter).toBe(balanceBefore - TRANSFER_AMOUNT);
      },
    );
  },
);
