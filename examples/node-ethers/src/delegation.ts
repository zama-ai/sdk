/**
 * Delegation example: delegate decryption rights to another wallet,
 * then decrypt balances as the delegate.
 *
 * Usage: PRIVATE_KEY=0x... TOKEN_ADDRESS=0x... COORDINATOR_ADDRESS=0x... DELEGATE_ADDRESS=0x... npx tsx src/delegation.ts
 */
import { Wallet, JsonRpcProvider, SigningKey } from "ethers";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { EthersSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address } from "@zama-fhe/sdk";

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;
const DELEGATE_ADDRESS = process.env.DELEGATE_ADDRESS as Address;

async function main() {
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const signingKey = new SigningKey(PRIVATE_KEY);
  const wallet = new Wallet(signingKey, provider);
  const signer = new EthersSigner({ signer: wallet });
  const authConfig = { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      1: { network: MAINNET_RPC_URL, auth: authConfig },
      11155111: { network: SEPOLIA_RPC_URL, auth: authConfig },
    },
  });
  const storage = new MemoryStorage();
  const sdk = new ZamaSDK({ relayer, signer, storage });

  const wrapperAddress = await readWrapperForTokenContract(
    provider,
    COORDINATOR_ADDRESS,
    TOKEN_ADDRESS,
  );
  const token = sdk.createToken(TOKEN_ADDRESS, wrapperAddress as Address);

  try {
    // 1. Delegate decryption rights (permanent — no expiration)
    console.log("Delegating decryption to", DELEGATE_ADDRESS, "...");
    const delegateTx = await token.delegateDecryption({
      delegateAddress: DELEGATE_ADDRESS,
    });
    console.log("Delegation tx:", delegateTx.txHash);

    // 2. Check delegation status
    const delegated = await token.isDelegated({
      delegatorAddress: await sdk.signer.getAddress(),
      delegateAddress: DELEGATE_ADDRESS,
    });
    console.log("Is delegated:", delegated);

    // 3. Check delegation expiry
    const expiry = await token.getDelegationExpiry({
      delegatorAddress: await sdk.signer.getAddress(),
      delegateAddress: DELEGATE_ADDRESS,
    });
    console.log(
      "Delegation expiry:",
      expiry === 2n ** 64n - 1n ? "permanent" : new Date(Number(expiry) * 1000).toISOString(),
    );

    // 4. Decrypt balance as delegate (from the delegate's perspective)
    //    In a real scenario, the delegate would use their own private key.
    //    Here we show the API shape:
    const readonlyToken = sdk.createReadonlyToken(TOKEN_ADDRESS);
    const delegatorAddress = await sdk.signer.getAddress();
    const balance = await readonlyToken.decryptBalanceAs({ delegatorAddress });
    console.log("Delegated balance:", balance);

    // 5. Delegate with a custom expiration (1 week from now)
    console.log("\nRe-delegating with 1-week expiration...");
    const oneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const timedTx = await token.delegateDecryption({
      delegateAddress: DELEGATE_ADDRESS,
      expirationDate: oneWeek,
    });
    console.log("Timed delegation tx:", timedTx.txHash);

    // 6. Revoke delegation
    console.log("Revoking delegation...");
    const revokeTx = await token.revokeDelegation({
      delegateAddress: DELEGATE_ADDRESS,
    });
    console.log("Revoke tx:", revokeTx.txHash);

    const stillDelegated = await token.isDelegated({
      delegatorAddress: await sdk.signer.getAddress(),
      delegateAddress: DELEGATE_ADDRESS,
    });
    console.log("Is delegated after revoke:", stillDelegated);
  } finally {
    sdk.terminate();
  }
}

main().catch(console.error);
