/**
 * Scenario: A Node.js backend bootstraps the SDK, connects to the chain,
 * and verifies it can talk to the FHE infrastructure before serving requests.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { MemoryStorage, ZamaSDK, HardhatConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, http, type Address } from "viem";
import { foundry } from "viem/chains";

test("backend bootstraps SDK, verifies FHE infra, and shuts down cleanly", async ({
  transport,
  viemClient,
  contracts,
}) => {
  // 1. Server creates RelayerNode with worker pool
  const relayer = new RelayerNode({
    getChainId: async () => HardhatConfig.chainId,
    transports: {
      [HardhatConfig.chainId]: transport,
    },
    poolSize: 2,
  });
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(transport.network as string),
  });
  const signer = new ViemSigner({ walletClient: viemClient, publicClient });

  // Use a block scope so `using` disposes before the post-terminate check
  {
    using sdk = new ZamaSDK({ relayer, signer, storage: new MemoryStorage() });

    // 2. Verify ACL contract is reachable
    const aclAddress = await relayer.getAclAddress();
    expect(aclAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // 3. Verify FHE worker pool initializes — generate a keypair
    const keypair = await relayer.generateKeypair();
    expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);

    // 4. Verify EIP-712 generation works
    const eip712 = await relayer.createEIP712(
      keypair.publicKey,
      [contracts.cUSDT],
      Math.floor(Date.now() / 1000),
      7,
    );
    expect(eip712.domain.chainId).toBe(31337);

    // 5. Verify delegated EIP-712 generation
    const delegatedEip712 = await relayer.createDelegatedUserDecryptEIP712(
      keypair.publicKey,
      [contracts.cUSDT],
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
      Math.floor(Date.now() / 1000),
      7,
    );
    expect(delegatedEip712.primaryType).toBe("DelegatedUserDecryptRequestVerification");

    // 6. Verify public key and params are available
    const pk = await relayer.getPublicKey();
    expect(pk).not.toBeNull();
    const pp = await relayer.getPublicParams(2048);
    expect(pp).not.toBeNull();

    // 7. Create tokens and verify on-chain metadata
    const readonlyUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
    expect(await readonlyUSDT.isConfidential()).toBe(true);
    expect(await readonlyUSDT.isWrapper()).toBe(true);
    expect(await readonlyUSDT.decimals()).toBe(6);
    const name = await readonlyUSDT.name();
    expect(name.length).toBeGreaterThan(0);
  }
  // 8. sdk disposed here → relayer terminated

  // 9. Post-terminate, relayer rejects requests
  await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
});

test("SDK rejects invalid keypairTTL at construction", async ({
  anvilPort,
  viemClient,
  relayer,
}) => {
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(`http://127.0.0.1:${anvilPort}`),
  });
  const signer = new ViemSigner({ walletClient: viemClient, publicClient });
  expect(
    () => new ZamaSDK({ relayer, signer, storage: new MemoryStorage(), keypairTTL: 0 }),
  ).toThrow("keypairTTL must be a positive number");
});
