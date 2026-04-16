import { Contract, formatUnits, JsonRpcProvider, Wallet } from "ethers";
import {
  confidentialBalanceOfContract,
  DelegationNotPropagatedError,
  MemoryStorage,
  SepoliaConfig,
  ZamaSDK,
} from "@zama-fhe/sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address, Handle } from "@zama-fhe/sdk";

// ── Token amounts (USDT uses 6 decimals) ─────────────────────────────────────
const DECIMALS = 6n;
const MINT_AMOUNT = 1_000n * 10n ** DECIMALS; //  1 000 USDT — minted to Account A
const SHIELD_AMOUNT = 100n * 10n ** DECIMALS; //    100 USDT → shielded to cUSDT
const TRANSFER_AMOUNT = 10n * 10n ** DECIMALS; //    10 cUSDT — transferred to Account B
const UNSHIELD_AMOUNT = 50n * 10n ** DECIMALS; //    50 cUSDT → unshielded back to USDT

// ── ERC-20 ABI fragments ──────────────────────────────────────────────────────
const ERC20_ABI = [
  "function mint(address account, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
] as const;

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

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const DELEGATE_PRIVATE_KEY = process.env.DELEGATE_PRIVATE_KEY;
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const RELAYER_API_KEY = process.env.RELAYER_API_KEY;
  const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

  if (!PRIVATE_KEY) throw new Error("Missing env: PRIVATE_KEY");
  if (!DELEGATE_PRIVATE_KEY) throw new Error("Missing env: DELEGATE_PRIVATE_KEY");
  if (!SEPOLIA_RPC_URL) throw new Error("Missing env: SEPOLIA_RPC_URL");
  if (!TOKEN_ADDRESS) throw new Error("Missing env: TOKEN_ADDRESS");

  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const walletA = new Wallet(PRIVATE_KEY, provider);
  const walletB = new Wallet(DELEGATE_PRIVATE_KEY, provider);

  console.log("Account A:", walletA.address);
  console.log("Account B:", walletB.address, "(delegate)");

  const signerA = new EthersSigner({ signer: walletA });
  const signerB = new EthersSigner({ signer: walletB });

  const auth = RELAYER_API_KEY
    ? { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY }
    : undefined;

  // RelayerNode uses Node.js worker_threads for FHE operations — pure backend,
  // no browser dependencies. A single instance can be shared across SDK objects.
  const relayer = new RelayerNode({
    getChainId: async () => SepoliaConfig.chainId,
    transports: {
      [SepoliaConfig.chainId]: {
        network: SEPOLIA_RPC_URL,
        ...(auth && { auth }),
      },
    },
  });

  // Each SDK instance has its own signer context.
  // MemoryStorage is sufficient here; in production use a persistent store
  // (e.g. Redis via a custom GenericStorage) to cache FHE credentials across
  // process restarts.
  // `using` ensures terminate() is called when the scope exits (even on error).
  // Both SDKs share the same relayer; relayer.terminate() is idempotent.
  using sdkA = new ZamaSDK({ relayer, signer: signerA, storage: new MemoryStorage() });
  using sdkB = new ZamaSDK({ relayer, signer: signerB, storage: new MemoryStorage() });

  // Resolve the confidential wrapper address via the on-chain registry.
  // getConfidentialToken() maps an ERC-20 address → its ERC-7984 wrapper.
  const registryResult = await sdkA.registry.getConfidentialToken(TOKEN_ADDRESS as Address);
  if (!registryResult) {
    throw new Error(`No confidential wrapper registered for ${TOKEN_ADDRESS}`);
  }
  const { confidentialTokenAddress } = registryResult;
  console.log("ERC-20 token:        ", TOKEN_ADDRESS);
  console.log("Confidential wrapper:", confidentialTokenAddress);

  // createToken() takes the confidential token address. The SDK resolves the
  // underlying ERC-20 automatically via underlyingContract(this.wrapper).
  const tokenA = sdkA.createToken(confidentialTokenAddress);
  const tokenB = sdkB.createToken(confidentialTokenAddress);

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 2 — Mint
  // Mint USDT directly on the ERC-20 mock contract so Account A has tokens
  // to shield. On a production token this step would not be available.
  // ──────────────────────────────────────────────────────────────────────────
  section("SECTION 2 — Mint");

  const erc20 = new Contract(TOKEN_ADDRESS as Address, ERC20_ABI, walletA);
  const mintFn = erc20.getFunction("mint");
  const balanceOfFn = erc20.getFunction("balanceOf");

  const erc20BalanceBefore = (await balanceOfFn(walletA.address)) as bigint;
  console.log("ERC-20 balance before mint:", fmt(erc20BalanceBefore));

  console.log(`Minting ${fmt(MINT_AMOUNT)} to Account A...`);
  const mintTx = await mintFn(walletA.address, MINT_AMOUNT);
  console.log("  Mint tx:", mintTx.hash);
  await mintTx.wait();

  const erc20BalanceAfter = (await balanceOfFn(walletA.address)) as bigint;
  console.log("ERC-20 balance after mint: ", fmt(erc20BalanceAfter));

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 3 — Confidential Token Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
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
    onApprovalSubmitted: (tx) => console.log("  Approval submitted:", tx),
    onShieldSubmitted: (tx) => console.log("  Shield submitted:  ", tx),
  });

  const balanceA1 = await tokenA.balanceOf();
  console.log("cUSDT balance (A, after shield):", fmt(balanceA1));

  // 3c. Confidential transfer: A → B
  // The amount is encrypted client-side before being sent on-chain.
  console.log("\n── 3c. Confidential transfer ──");
  console.log(`Transferring ${fmt(TRANSFER_AMOUNT)} cUSDT: A → B...`);
  await tokenA.confidentialTransfer(walletB.address as Address, TRANSFER_AMOUNT, {
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
  const erc20BalanceFinal = (await balanceOfFn(walletA.address)) as bigint;
  console.log("\ncUSDT balance (A, final):", fmt(balanceA3));
  console.log("USDT  balance (A, final):", fmt(erc20BalanceFinal));

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 4 — Delegation
  // Account A grants Account B the right to decrypt A's confidential balance.
  // This is useful in backend systems where a service account (B) needs to
  // read balances on behalf of users (A) without holding their private key.
  // ──────────────────────────────────────────────────────────────────────────
  section("SECTION 4 — Delegation");

  // 4a. Grant: A delegates decrypt rights to B
  console.log("── 4a. Grant delegation: A → B ──");
  await tokenA.delegateDecryption({ delegateAddress: walletB.address as Address });

  const isDelegated = await tokenA.isDelegated({
    delegatorAddress: walletA.address as Address,
    delegateAddress: walletB.address as Address,
  });
  console.log("Delegation active:", isDelegated);

  // 4b. Decrypt as delegate: B reads A's balance without A's private key
  // The ACL grant must propagate across the infrastructure before the relayer
  // can verify it. This typically takes 1–2 minutes on Sepolia.
  console.log("\n── 4b. Decrypt as delegate ──");
  console.log("Account B reading Account A's cUSDT balance...");
  {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 30_000;
    let decrypted = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const balanceOfAasB = await tokenB.decryptBalanceAs({
          delegatorAddress: walletA.address as Address,
        });
        console.log("cUSDT balance (A, seen by B):", fmt(balanceOfAasB));
        decrypted = true;
        break;
      } catch (err) {
        if (err instanceof DelegationNotPropagatedError && attempt < MAX_RETRIES) {
          console.warn(
            `  ACL grant not yet propagated (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1_000}s...`,
          );
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          throw err;
        }
      }
    }
    if (!decrypted) {
      console.warn("  ⚠ Delegate decrypt did not succeed after retries.");
    }
  }

  // 4c. Revoke: A removes B's decrypt rights
  console.log("\n── 4c. Revoke delegation ──");
  await tokenA.revokeDelegation({ delegateAddress: walletB.address as Address });

  const isDelegatedAfter = await tokenA.isDelegated({
    delegatorAddress: walletA.address as Address,
    delegateAddress: walletB.address as Address,
  });
  console.log("Delegation active after revoke:", isDelegatedAfter);

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 5 — SDK Primitives
  // Sections 3–4 use the high-level Token class. The SDK also exposes
  // lower-level primitives — sdk.allow(), sdk.userDecrypt(), and
  // sdk.publicDecrypt() — for advanced use cases like multi-token batch
  // decrypts or custom contract integrations.
  // ──────────────────────────────────────────────────────────────────────────
  section("SECTION 5 — SDK Primitives");

  // 5a. sdk.allow() — pre-authorize contracts for decryption
  // A single wallet signature covers all supplied contract addresses. Subsequent
  // userDecrypt() calls for these contracts reuse the cached credentials — no
  // additional signature prompts.
  console.log("── 5a. Pre-authorize decrypt credentials ──");
  await sdkA.allow([confidentialTokenAddress]);
  console.log("Credentials cached for:", confidentialTokenAddress);

  // 5b. sdk.userDecrypt() — decrypt arbitrary FHE handles
  // Read the encrypted balance handle from the chain, then decrypt it with
  // userDecrypt(). This is what Token.balanceOf() does internally.
  console.log("\n── 5b. Decrypt balance via sdk.userDecrypt() ──");
  const handle = (await sdkA.signer.readContract(
    confidentialBalanceOfContract(confidentialTokenAddress, walletA.address as Address),
  )) as Handle;
  console.log("Encrypted handle:", handle);

  const values = await sdkA.userDecrypt([{ handle, contractAddress: confidentialTokenAddress }]);
  const decryptedBalance = values[handle] as bigint;
  console.log("Decrypted balance:", fmt(decryptedBalance));

  // 5c. sdk.publicDecrypt() — decrypt handles publicly (with proof)
  // publicDecrypt returns clear values alongside a decryption proof for on-chain
  // finalization (e.g. finalizeUnwrap). Unlike userDecrypt, no credentials are needed.
  console.log("\n── 5c. Public decrypt ──");
  const publicResult = await sdkA.publicDecrypt([handle]);
  const publicValue = publicResult.clearValues[handle] as bigint;
  console.log("Public decrypted value:", fmt(publicValue));
  console.log("Decryption proof:", publicResult.decryptionProof.slice(0, 42) + "…");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exitCode = 1;
});
