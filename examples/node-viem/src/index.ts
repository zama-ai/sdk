import { createPublicClient, createWalletClient, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address } from "@zama-fhe/sdk";

// ── Sepolia contract addresses ────────────────────────────────────────────────
// USDT mock ERC-20 (mintable in this demo)
const USDT_ADDRESS = "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0" as Address;
// Confidential USDT — ERC-7984 wrapper (the token the SDK operates on)
const CUSDT_ADDRESS = "0x4E7B06D78965594eB5EF5414c357ca21E1554491" as Address;

// ── Token amounts (USDT uses 6 decimals) ─────────────────────────────────────
const DECIMALS = 6n;
const MINT_AMOUNT = 1_000n * 10n ** DECIMALS; //  1 000 USDT — minted to Account A
const SHIELD_AMOUNT = 100n * 10n ** DECIMALS; //    100 USDT → shielded to cUSDT
const TRANSFER_AMOUNT = 10n * 10n ** DECIMALS; //    10 cUSDT — transferred to Account B
const UNSHIELD_AMOUNT = 50n * 10n ** DECIMALS; //    50 cUSDT → unshielded back to USDT

// ── ERC-20 ABI fragments ──────────────────────────────────────────────────────
const ERC20_ABI = parseAbi([
  "function mint(address account, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
]);

function fmt(amount: bigint): string {
  return `${formatUnits(amount, Number(DECIMALS))} USDT`;
}

function section(title: string): void {
  console.log(`\n${"═".repeat(56)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(56)}\n`);
}

async function main() {
  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 1 — Setup
  // ──────────────────────────────────────────────────────────────────────────
  section("SECTION 1 — Setup");

  const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
  const DELEGATE_PRIVATE_KEY = process.env.DELEGATE_PRIVATE_KEY as `0x${string}`;
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const RELAYER_API_KEY = process.env.RELAYER_API_KEY;

  if (!PRIVATE_KEY) throw new Error("Missing env: PRIVATE_KEY");
  if (!DELEGATE_PRIVATE_KEY) throw new Error("Missing env: DELEGATE_PRIVATE_KEY");
  if (!SEPOLIA_RPC_URL) throw new Error("Missing env: SEPOLIA_RPC_URL");

  const accountA = privateKeyToAccount(PRIVATE_KEY);
  const accountB = privateKeyToAccount(DELEGATE_PRIVATE_KEY);

  console.log("Account A:", accountA.address);
  console.log("Account B:", accountB.address, "(delegate)");

  const transport = http(SEPOLIA_RPC_URL);

  // A single public client is shared for read operations.
  const publicClient = createPublicClient({ chain: sepolia, transport });

  // Each account needs its own wallet client for signing transactions.
  const walletClientA = createWalletClient({ account: accountA, chain: sepolia, transport });
  const walletClientB = createWalletClient({ account: accountB, chain: sepolia, transport });

  const auth = RELAYER_API_KEY
    ? { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY }
    : undefined;

  // RelayerNode uses Node.js worker_threads for FHE operations — pure backend,
  // no browser dependencies. A single instance can be shared across SDK objects.
  const relayer = new RelayerNode({
    getChainId: () => signerA.getChainId(),
    transports: {
      [sepolia.id]: { ...(auth && { auth }) },
    },
  });

  const signerA = new ViemSigner({ walletClient: walletClientA, publicClient });
  const signerB = new ViemSigner({ walletClient: walletClientB, publicClient });

  // Each SDK instance has its own signer context.
  // MemoryStorage is sufficient here; in production use a persistent store
  // (e.g. Redis via a custom GenericStorage) to cache FHE credentials across
  // process restarts.
  const sdkA = new ZamaSDK({ relayer, signer: signerA, storage: new MemoryStorage() });
  const sdkB = new ZamaSDK({ relayer, signer: signerB, storage: new MemoryStorage() });

  // createToken() takes the confidential token (ERC-7984 wrapper) address.
  // The underlying ERC-20 address is resolved on-chain when needed.
  const tokenA = sdkA.createToken(CUSDT_ADDRESS);
  const tokenB = sdkB.createToken(CUSDT_ADDRESS);

  try {
    // ────────────────────────────────────────────────────────────────────────
    // SECTION 2 — Mint
    // Mint USDT directly on the ERC-20 mock contract so Account A has tokens
    // to shield. On a production token this step would not be available.
    // ────────────────────────────────────────────────────────────────────────
    section("SECTION 2 — Mint");

    const erc20BalanceBefore = await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [accountA.address],
    });
    console.log("ERC-20 balance before mint:", fmt(erc20BalanceBefore));

    console.log(`Minting ${fmt(MINT_AMOUNT)} to Account A...`);
    const mintHash = await walletClientA.writeContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [accountA.address, MINT_AMOUNT],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log("  Mint tx:", mintHash);

    const erc20BalanceAfter = await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [accountA.address],
    });
    console.log("ERC-20 balance after mint: ", fmt(erc20BalanceAfter));

    // ────────────────────────────────────────────────────────────────────────
    // SECTION 3 — Confidential Token Lifecycle
    // ────────────────────────────────────────────────────────────────────────
    section("SECTION 3 — Confidential Token Lifecycle");

    // 3a. Initial confidential balance
    console.log("── 3a. Initial balances ──");
    const balanceA0 = await tokenA.balanceOf();
    const balanceB0 = await tokenB.balanceOf();
    console.log("cUSDT balance (A):", fmt(balanceA0));
    console.log("cUSDT balance (B):", fmt(balanceB0));

    // 3b. Shield: ERC-20 USDT → confidential cUSDT
    // shield() handles approval + wrap in a single call.
    console.log("\n── 3b. Shield ──");
    console.log(`Shielding ${fmt(SHIELD_AMOUNT)} USDT → cUSDT (Account A)...`);
    await tokenA.shield(SHIELD_AMOUNT, {
      callbacks: {
        onApprovalSubmitted: (tx) => console.log("  Approval submitted:", tx),
        onShieldSubmitted: (tx) => console.log("  Shield submitted:  ", tx),
      },
    });

    const balanceA1 = await tokenA.balanceOf();
    console.log("cUSDT balance (A, after shield):", fmt(balanceA1));

    // 3c. Confidential transfer: A → B
    // The amount is encrypted client-side before being sent on-chain —
    // only the recipient and the token contract can read it.
    console.log("\n── 3c. Confidential transfer ──");
    console.log(`Transferring ${fmt(TRANSFER_AMOUNT)} cUSDT: A → B...`);
    await tokenA.confidentialTransfer(accountB.address as Address, TRANSFER_AMOUNT, {
      onEncryptComplete: () => console.log("  Encryption complete"),
      onTransferSubmitted: (tx) => console.log("  Transfer submitted:", tx),
    });

    const balanceA2 = await tokenA.balanceOf();
    const balanceB2 = await tokenB.balanceOf();
    console.log("cUSDT balance (A, after transfer):", fmt(balanceA2));
    console.log("cUSDT balance (B, after transfer):", fmt(balanceB2));

    // 3d. Unshield: confidential cUSDT → ERC-20 USDT
    // unshield() is a two-phase operation (unwrap + finalizeUnwrap).
    // The callbacks let you track each phase; both are awaited automatically.
    console.log("\n── 3d. Unshield ──");
    console.log(`Unshielding ${fmt(UNSHIELD_AMOUNT)} cUSDT → USDT (Account A)...`);
    await tokenA.unshield(UNSHIELD_AMOUNT, {
      onUnwrapSubmitted: (tx) => console.log("  Unwrap submitted:   ", tx),
      onFinalizing: () => console.log("  Waiting for finalization..."),
      onFinalizeSubmitted: (tx) => console.log("  Finalize submitted:", tx),
    });

    const balanceA3 = await tokenA.balanceOf();
    const erc20BalanceFinal = await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [accountA.address],
    });
    console.log("\ncUSDT balance (A, final):", fmt(balanceA3));
    console.log("USDT  balance (A, final):", fmt(erc20BalanceFinal));

    // ────────────────────────────────────────────────────────────────────────
    // SECTION 4 — Delegation
    // Account A grants Account B the right to decrypt A's confidential balance.
    // This is useful in backend systems where a service account (B) needs to
    // read balances on behalf of users (A) without holding their private key.
    // ────────────────────────────────────────────────────────────────────────
    section("SECTION 4 — Delegation");

    // 4a. Grant: A delegates decrypt rights to B
    console.log("── 4a. Grant delegation: A → B ──");
    await tokenA.delegateDecryption({ delegateAddress: accountB.address as Address });

    const isDelegated = await tokenA.isDelegated({
      delegatorAddress: accountA.address as Address,
      delegateAddress: accountB.address as Address,
    });
    console.log("Delegation active:", isDelegated);

    // 4b. Decrypt as delegate: B reads A's balance without A's private key
    console.log("\n── 4b. Decrypt as delegate ──");
    console.log("Account B reading Account A's cUSDT balance...");
    const balanceOfAasB = await tokenB.decryptBalanceAs({
      delegatorAddress: accountA.address as Address,
    });
    console.log("cUSDT balance (A, seen by B):", fmt(balanceOfAasB));

    // 4c. Revoke: A removes B's decrypt rights
    console.log("\n── 4c. Revoke delegation ──");
    await tokenA.revokeDelegation({ delegateAddress: accountB.address as Address });

    const isDelegatedAfter = await tokenA.isDelegated({
      delegatorAddress: accountA.address as Address,
      delegateAddress: accountB.address as Address,
    });
    console.log("Delegation active after revoke:", isDelegatedAfter);
  } finally {
    // Always terminate to release Node.js worker threads.
    // sdkB shares the same relayer instance — dispose() unsubscribes its
    // signer listeners without killing the already-terminating relayer.
    sdkB.dispose();
    sdkA.terminate();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
