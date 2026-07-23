// Headless e2e smoke test for the BNB Smart Chain Testnet (chain 97) cleartext/mock deployment.
//
// Runs the full confidential-token lifecycle against the live BNB deployment:
//   mint USDC → shield → confidential balance → confidential transfer → unshield
//   (+ a delegate-decryption check as a bonus).
//
// Usage:
//   PRIVATE_KEY=0x... node scripts/smoke-e2e.mjs
//
// Uses the cleartext() relayer transport — no real relayer/KMS network.

import { createPublicClient, createWalletClient, formatUnits, http, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ZamaSDK, MemoryStorage, cleartext } from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/viem";

const RPC = process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || "https://bsc-testnet-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing env: PRIVATE_KEY");

const USDC = "0x1b3BC224c233D38Db8A92DA3fC44d01A9232b64c";

// Cleartext FHEVM host stack for BNB Smart Chain Testnet (chain 97) — development/integration setup,
// not intended for production use.
const zamaBscTestnetCleartext = {
  id: 97,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: RPC,
  aclContractAddress: "0x52470e945521E247Cb4754088a836Dc4b838AFBE",
  kmsContractAddress: "0x788F5BB2d93aB4Cb67Fe2277757aE95006504F6F",
  inputVerifierContractAddress: "0x49e0BAB39904E4192c30CFB58573Cbe27B7E398E",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0xc0E8B73b1C58D846e1d4f8fAE2E1466C85BCeAeC",
  executorAddress: "0x5985e48689550c1b2893ABfBbe4cc0eE3A22cc54",
};

const DECIMALS = 6n;
const MINT_AMOUNT = 1_000n * 10n ** DECIMALS;
const SHIELD_AMOUNT = 100n * 10n ** DECIMALS;
const TRANSFER_AMOUNT = 10n * 10n ** DECIMALS;
const UNSHIELD_AMOUNT = 50n * 10n ** DECIMALS;

const ERC20_ABI = parseAbi([
  "function mint(address account, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
]);

const fmt = (a) => `${formatUnits(a, Number(DECIMALS))}`;
const section = (t) => console.log(`\n${"═".repeat(56)}\n  ${t}\n${"═".repeat(56)}`);

async function main() {
  section("SECTION 1 — Setup");
  const accountA = privateKeyToAccount(PRIVATE_KEY);
  const accountB = privateKeyToAccount(generatePrivateKey());
  const publicClient = createPublicClient({ chain: bscTestnet, transport: http(RPC) });
  const walletClientA = createWalletClient({
    account: accountA,
    chain: bscTestnet,
    transport: http(RPC),
  });
  const walletClientB = createWalletClient({
    account: accountB,
    chain: bscTestnet,
    transport: http(RPC),
  });
  console.log("Account A:", accountA.address);
  console.log("Account B:", accountB.address, "(delegate / transfer recipient)");

  const relayers = { [zamaBscTestnetCleartext.id]: cleartext() };
  const sdkA = new ZamaSDK(
    createConfig({
      chains: [zamaBscTestnetCleartext],
      publicClient,
      walletClient: walletClientA,
      storage: new MemoryStorage(),
      relayers,
    }),
  );
  const sdkB = new ZamaSDK(
    createConfig({
      chains: [zamaBscTestnetCleartext],
      publicClient,
      walletClient: walletClientB,
      storage: new MemoryStorage(),
      relayers,
    }),
  );

  const reg = await sdkA.registry.getConfidentialToken(USDC);
  if (!reg || !reg.isValid) throw new Error(`No valid wrapper registered for ${USDC}`);
  const { confidentialTokenAddress } = reg;
  console.log("USDC:               ", USDC);
  console.log("Confidential wrapper:", confidentialTokenAddress);

  const tokenA = sdkA.createWrappedToken(confidentialTokenAddress);
  const tokenB = sdkB.createToken(confidentialTokenAddress);

  section("SECTION 2 — Mint USDC");
  const before = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [accountA.address],
  });
  console.log("USDC balance before:", fmt(before));
  const mintHash = await walletClientA.writeContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: "mint",
    args: [accountA.address, MINT_AMOUNT],
  });
  console.log("  mint tx:", mintHash);
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(
    "USDC balance after: ",
    fmt(
      await publicClient.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [accountA.address],
      }),
    ),
  );

  section("SECTION 3 — Confidential lifecycle");
  console.log("cUSDC balance (A) initial:", fmt(await tokenA.balanceOf(accountA.address)));

  console.log(`\n── Shield ${fmt(SHIELD_AMOUNT)} USDC → cUSDC ──`);
  await tokenA.shield(SHIELD_AMOUNT, {
    onApprovalSubmitted: (t) => console.log("  approval:", t),
    onShieldSubmitted: (t) => console.log("  shield:  ", t),
  });
  console.log("cUSDC balance (A) after shield:", fmt(await tokenA.balanceOf(accountA.address)));

  console.log(`\n── Confidential transfer ${fmt(TRANSFER_AMOUNT)} cUSDC: A → B ──`);
  await tokenA.confidentialTransfer(accountB.address, TRANSFER_AMOUNT, {
    onEncryptComplete: () => console.log("  encryption complete"),
    onTransferSubmitted: (t) => console.log("  transfer:", t),
  });
  console.log("cUSDC balance (A) after transfer:", fmt(await tokenA.balanceOf(accountA.address)));
  console.log("cUSDC balance (B) after transfer:", fmt(await tokenB.balanceOf(accountB.address)));

  console.log(`\n── Unshield ${fmt(UNSHIELD_AMOUNT)} cUSDC → USDC ──`);
  await tokenA.unshield(UNSHIELD_AMOUNT, {
    onUnwrapSubmitted: (t) => console.log("  unwrap:  ", t),
    onFinalizing: () => console.log("  finalizing..."),
    onFinalizeSubmitted: (t) => console.log("  finalize:", t),
  });
  console.log("cUSDC balance (A) final:", fmt(await tokenA.balanceOf(accountA.address)));
  console.log(
    "USDC  balance (A) final:",
    fmt(
      await publicClient.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [accountA.address],
      }),
    ),
  );

  // Delegation is part of the validated flow — failures here are fatal (they propagate
  // to main().catch below), so a regression cannot pass silently.
  section("SECTION 4 — Delegation");
  await tokenA.delegateDecryption({ delegateAddress: accountB.address });
  console.log(
    "delegation active:",
    await tokenA.isDelegated({
      delegatorAddress: accountA.address,
      delegateAddress: accountB.address,
    }),
  );
  const seenByB = await tokenB.decryptBalanceAs({ delegatorAddress: accountA.address });
  console.log("cUSDC balance (A, seen by B):", fmt(seenByB));
  await tokenA.revokeDelegation({ delegateAddress: accountB.address });
  console.log(
    "delegation active after revoke:",
    await tokenA.isDelegated({
      delegatorAddress: accountA.address,
      delegateAddress: accountB.address,
    }),
  );

  sdkA.terminate?.();
  sdkB.terminate?.();
  section("✅ SMOKE TEST PASSED");
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exitCode = 1;
});
