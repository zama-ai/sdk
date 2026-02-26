# Core SDK

The core SDK (`@zama-fhe/sdk`) lets you shield, transfer, and unshield confidential ERC-20 tokens from any TypeScript environment — browser or Node.js. It handles FHE encryption, wallet signatures, and contract interactions behind a simple API.

## Install

```bash
pnpm add @zama-fhe/sdk
```

You also need a Web3 library. Pick one:

```bash
# Option A: viem
pnpm add viem

# Option B: ethers
pnpm add ethers

# Option C: implement GenericSigner yourself (no extra dep)
```

For Node.js, you'll additionally need `@zama-fhe/relayer-sdk`:

```bash
pnpm add @zama-fhe/relayer-sdk
```

## Three things to set up

Every SDK setup needs three pieces:

```ts
const sdk = new ZamaSDK({
  relayer, // handles encryption & decryption (RelayerWeb or RelayerNode)
  signer, // signs transactions and typed data (ViemSigner, EthersSigner, or your own)
  storage, // persists FHE credentials so users don't re-sign on every page load
});
```

See the [Configuration](configuration.md) page for all the details on each piece.

## What you can do

Once you have an SDK instance, create a token and start operating on it:

```ts
const token = sdk.createToken("0xEncryptedERC20Address");
```

### Shield tokens (public → private)

Convert public ERC-20 tokens into their confidential form. The SDK handles the ERC-20 approval for you.

```ts
await token.shield(1000n);

// Or with max approval to avoid future approval txs
await token.shield(1000n, { approvalStrategy: "max" });

// For ETH wrapper contracts
await token.shieldETH(1000n);
```

### Check your balance

The first call prompts the wallet for a signature to generate FHE decrypt credentials. Subsequent calls reuse cached credentials silently.

```ts
const balance = await token.balanceOf();
```

### Transfer privately

The amount is encrypted before it hits the chain. Nobody can see how much you sent.

```ts
await token.confidentialTransfer("0xRecipient", 500n);

// Operator transfer (on behalf of someone who approved you)
await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

### Unshield tokens (private → public)

Withdraw confidential tokens back to public ERC-20. This is a two-step process on-chain (unwrap + finalize), but the SDK orchestrates it in a single call.

```ts
await token.unshield(500n);

// Or unshield everything
await token.unshieldAll();
```

You can track progress with callbacks:

```ts
await token.unshield(500n, {
  onUnwrapSubmitted: (txHash) => console.log("Step 1 done:", txHash),
  onFinalizing: () => console.log("Waiting for decryption proof..."),
  onFinalizeSubmitted: (txHash) => console.log("Complete:", txHash),
});
```

### Approve operators

Let another address act on your behalf (e.g. a DEX or multisig).

```ts
// Approve for 1 hour (default)
await token.approve("0xSpender");

// Approve until a specific timestamp
await token.approve("0xSpender", futureTimestamp);

// Check if someone is approved
const isApproved = await token.isApproved("0xSpender");
```

### Batch operations

When your app manages multiple tokens, you can pre-authorize them all with one wallet prompt and decrypt balances in parallel:

```ts
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));

// One wallet signature covers all tokens
await ReadonlyToken.authorizeAll(tokens);

// Decrypt all balances in parallel
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { owner });
```

## Read-only access

If you only need to read balances (no shielding/transferring), use `ReadonlyToken`:

```ts
const readonlyToken = sdk.createReadonlyToken("0xTokenAddress");

const balance = await readonlyToken.balanceOf();
const name = await readonlyToken.name();
const isConfidential = await readonlyToken.isConfidential();
```

## Supported networks

| Network          | Chain ID | Preset          |
| ---------------- | -------- | --------------- |
| Ethereum Mainnet | 1        | `MainnetConfig` |
| Sepolia Testnet  | 11155111 | `SepoliaConfig` |
| Local Hardhat    | 31337    | `HardhatConfig` |

## Next steps

- [Configuration](configuration.md) — relayer, signer, storage, and authentication setup
- [Error Handling](error-handling.md) — catch and handle specific failure types
- [Contract Call Builders](contract-builders.md) — low-level contract calls for advanced use cases
