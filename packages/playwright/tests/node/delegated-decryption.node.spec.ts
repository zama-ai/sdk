/**
 * Scenario: Account A shields tokens and delegates decryption to Account B.
 * Account B uses the delegation to decrypt A's balance — exercising
 * decryptBalanceAs and batchDecryptBalancesAs, the core delegated decryption APIs.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { createPublicClient, createWalletClient, http, PublicClient, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { MemoryStorage, ZamaSDK, ReadonlyToken, HardhatConfig } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";

// Account #0 = delegator (default test account, provided by fixture)
// Account #1 = delegate (creates its own SDK)
const DELEGATE_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const delegateAccount = privateKeyToAccount(DELEGATE_PK);

/** Create an independent SDK for the delegate account. */
function createDelegateSdk(anvilPort: number) {
  const transport = http(`http://127.0.0.1:${anvilPort}`);
  const publicClient = createPublicClient({
    chain: foundry,
    transport,
  }) as PublicClient;
  const walletClient = createWalletClient({
    account: delegateAccount,
    chain: foundry,
    transport,
  });
  const relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: {
        ...HardhatConfig,
        network: `http://127.0.0.1:${anvilPort}`,
      },
    },
    poolSize: 1,
  });
  const signer = new ViemSigner({ walletClient, publicClient });
  const sdk = new ZamaSDK({ relayer, signer, storage: new MemoryStorage() });
  return { sdk, relayer };
}

test("decryptBalanceAs — delegate reads delegator's balance", async ({
  sdk: delegatorSdk,
  contracts,
  anvilPort,
  account: delegatorAccount,
  computeFee,
  initialBalances,
}) => {
  const shieldAmount = 500n * 10n ** 6n;

  // Delegator shields tokens (use wrapper-only so this.address = cUSDT)
  const token = delegatorSdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // Delegator delegates decryption to the delegate account.
  // delegateDecryption passes this.address (cUSDT) to the ACL.
  await token.delegateDecryption({ delegateAddress: delegateAccount.address });

  // Create a separate SDK for the delegate
  const { sdk: delegateSdk, relayer } = createDelegateSdk(anvilPort);
  try {
    await delegateSdk.allow(contracts.cUSDT as Address);

    // Delegate decrypts delegator's balance using the wrapper address
    // (must match the address used for delegation)
    const readToken = delegateSdk.createReadonlyToken(contracts.cUSDT as Address);
    const balance = await readToken.decryptBalanceAs({
      delegatorAddress: delegatorAccount.address,
    });

    const expected = initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount);
    expect(balance).toBe(expected);
  } finally {
    delegateSdk.terminate();
    relayer.terminate();
  }
});

test("batchDecryptBalancesAs — delegate reads multiple token balances", async ({
  sdk: delegatorSdk,
  contracts,
  anvilPort,
  account: delegatorAccount,
  computeFee,
  initialBalances,
}) => {
  const shieldUSDT = 300n * 10n ** 6n;
  const shieldUSDC = 400n * 10n ** 6n;

  // Delegator shields both tokens (wrapper-only addresses)
  const tokenUSDT = delegatorSdk.createToken(contracts.cUSDT as Address);
  const tokenUSDC = delegatorSdk.createToken(contracts.cUSDC as Address);
  await tokenUSDT.shield(shieldUSDT);
  await tokenUSDC.shield(shieldUSDC);

  // Delegate decryption for both tokens
  await tokenUSDT.delegateDecryption({
    delegateAddress: delegateAccount.address,
  });
  await tokenUSDC.delegateDecryption({
    delegateAddress: delegateAccount.address,
  });

  // Create delegate SDK
  const { sdk: delegateSdk, relayer } = createDelegateSdk(anvilPort);
  try {
    await delegateSdk.allow(contracts.cUSDT as Address, contracts.cUSDC as Address);

    const readUSDT = delegateSdk.createReadonlyToken(contracts.cUSDT as Address);
    const readUSDC = delegateSdk.createReadonlyToken(contracts.cUSDC as Address);

    // Batch delegated decryption
    const balances = await ReadonlyToken.batchDecryptBalancesAs([readUSDT, readUSDC], {
      delegatorAddress: delegatorAccount.address,
    });

    expect(balances.size).toBe(2);
    expect(balances.get(contracts.cUSDT as Address)).toBe(
      initialBalances.cUSDT + shieldUSDT - computeFee(shieldUSDT),
    );
    expect(balances.get(contracts.cUSDC as Address)).toBe(
      initialBalances.cUSDC + shieldUSDC - computeFee(shieldUSDC),
    );
  } finally {
    delegateSdk.terminate();
    relayer.terminate();
  }
});

test("decryptBalanceAs fails without delegation", async ({
  sdk: delegatorSdk,
  contracts,
  anvilPort,
  account: delegatorAccount,
}) => {
  // Delegator shields but does NOT delegate
  const token = delegatorSdk.createToken(contracts.cUSDT as Address);
  await token.shield(100n * 10n ** 6n);

  // Delegate tries to decrypt without delegation — should fail
  const { sdk: delegateSdk, relayer } = createDelegateSdk(anvilPort);
  try {
    await delegateSdk.allow(contracts.cUSDT as Address);

    const readToken = delegateSdk.createReadonlyToken(contracts.cUSDT as Address);
    await expect(
      readToken.decryptBalanceAs({
        delegatorAddress: delegatorAccount.address,
      }),
    ).rejects.toThrow();
  } finally {
    delegateSdk.terminate();
    relayer.terminate();
  }
});

test("decryptBalanceAs fails after delegation expires", async ({
  sdk: delegatorSdk,
  contracts,
  anvilPort,
  viemClient,
  account: delegatorAccount,
}) => {
  // Delegator shields and delegates with a 2-hour expiry (minimum ACL allows)
  const token = delegatorSdk.createToken(contracts.cUSDT as Address);
  await token.shield(100n * 10n ** 6n);

  const block = await viemClient.getBlock();
  const twoHoursFromNow = new Date(Number(block.timestamp + 7200n) * 1000);
  await token.delegateDecryption({
    delegateAddress: delegateAccount.address,
    expirationDate: twoHoursFromNow,
  });

  // Fast-forward past the expiry
  await viemClient.increaseTime({ seconds: 7201 });
  await viemClient.mine({ blocks: 1 });

  // Delegate tries to decrypt — delegation has expired
  const { sdk: delegateSdk, relayer } = createDelegateSdk(anvilPort);
  try {
    await delegateSdk.allow(contracts.cUSDT as Address);

    const readToken = delegateSdk.createReadonlyToken(contracts.cUSDT as Address);
    await expect(
      readToken.decryptBalanceAs({
        delegatorAddress: delegatorAccount.address,
      }),
    ).rejects.toThrow();
  } finally {
    delegateSdk.terminate();
    relayer.terminate();
  }
});
