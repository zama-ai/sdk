# Cleartext Mode

Cleartext mode lets you develop and test your dApp without WASM, FHE infrastructure, or the `@zama-fhe/relayer-sdk` dependency. Instead of real encryption, plaintext values are stored on-chain via a `CleartextFHEVMExecutor` contract — your code behaves identically, but runs instantly.

## When to use it

| Scenario                  | Use                                                |
| ------------------------- | -------------------------------------------------- |
| Local Hardhat development | Cleartext mode                                     |
| Hoodi testnet prototyping | Cleartext mode                                     |
| Integration tests (CI)    | Cleartext mode                                     |
| Sepolia / Mainnet         | Production relayer (`RelayerWeb` or `RelayerNode`) |

Cleartext mode is a **drop-in replacement** for `RelayerWeb` and `RelayerNode` — same API, same method signatures, same `ZamaSDK` constructor. Switch between cleartext and production by changing the relayer.

## Install

No extra dependencies needed — cleartext mode is built into `@zama-fhe/sdk`:

```bash
pnpm add @zama-fhe/sdk
```

## Quick start

### With ZamaSDK (recommended)

```ts
import { ZamaSDK, MemoryStorage } from "@zama-fhe/sdk";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

// ethersSigner from BrowserProvider.getSigner() or Wallet.connect(provider)
const signer = new EthersSigner({ signer: ethersSigner });

const sdk = new ZamaSDK({
  relayer: new RelayerCleartext({
    getChainId: async () => 31337,
    transports: {
      31337: { network: "http://127.0.0.1:8545" },
    },
  }),
  signer,
  storage: new MemoryStorage(),
});

// Same API — shield, transfer, decrypt — all instant, no FHE overhead
const token = sdk.createToken("0xYourEncryptedERC20");
await token.shield(1000n);
const balance = await token.balanceOf();
```

### React

```tsx
import { ZamaProvider, RelayerCleartext, MemoryStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerCleartext({
  getChainId: () => signer.getChainId(),
  transports: {
    31337: { network: "http://127.0.0.1:8545" },
  },
});

function App() {
  return (
    <ZamaProvider relayer={relayer} signer={signer} storage={new MemoryStorage()}>
      <MyTokenPage />
    </ZamaProvider>
  );
}
```

All React hooks (`useConfidentialBalance`, `useConfidentialTransfer`, etc.) work identically.

## Configuration

`RelayerCleartext` takes the same shape as `RelayerWeb` and `RelayerNode`:

```ts
const relayer = new RelayerCleartext({
  getChainId: async () => chainId,
  transports: {
    [chainId]: {
      // Only 'network' is required — contract addresses use built-in defaults
      network: "http://127.0.0.1:8545",
    },
  },
});
```

### Partial config with defaults

For Hardhat and Hoodi, built-in defaults provide all contract addresses. You only need to supply `network`:

```ts
// Hardhat — all contract addresses auto-filled
transports: {
  31337: { network: "http://127.0.0.1:8545" },
}

// Hoodi — all contract addresses auto-filled
transports: {
  560048: { network: "https://rpc.hoodi.ethpandaops.io" },
}
```

### Full config (custom networks)

For non-standard deployments, provide the full `CleartextInstanceConfig`:

```ts
import type { CleartextInstanceConfig } from "@zama-fhe/sdk/cleartext";

transports: {
  99999: {
    chainId: 99999,
    gatewayChainId: 10901,
    network: "http://your-custom-node:8545",
    aclContractAddress: "0x...",
    kmsContractAddress: "0x...",
    inputVerifierContractAddress: "0x...",
    verifyingContractAddressDecryption: "0x...",
    verifyingContractAddressInputVerification: "0x...",
    cleartextExecutorAddress: "0x...",
  },
}
```

### Network presets

| Network       | Chain ID | Preset          | Notes                                          |
| ------------- | -------- | --------------- | ---------------------------------------------- |
| Local Hardhat | 31337    | `HardhatConfig` | Deterministic addresses from `@fhevm/solidity` |
| Hoodi Testnet | 560048   | `HoodiConfig`   | Public testnet                                 |

```ts
import { HardhatConfig, HoodiConfig } from "@zama-fhe/sdk";
```

## Switching between cleartext and production

The cleanest pattern is an environment variable:

```ts
import { RelayerWeb, RelayerNode } from "@zama-fhe/sdk";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";

function createRelayer(getChainId: () => Promise<number>) {
  if (process.env.FHEVM_MODE === "cleartext") {
    return new RelayerCleartext({
      getChainId,
      transports: {
        31337: { network: "http://127.0.0.1:8545" },
      },
    });
  }

  // Production
  return new RelayerWeb({
    getChainId,
    transports: {
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  });
}
```

## How it works

Under the hood, cleartext mode does the following instead of real FHE:

1. **Encryption** — values are stored as-is on-chain via the `CleartextFHEVMExecutor` contract. Handles are derived deterministically (same inputs = same handles).

2. **Decryption** — plaintext values are read back from the executor contract. ACL checks (who is allowed to decrypt) still run on-chain, matching production behavior.

3. **Keypairs & signatures** — `generateKeypair()` returns random bytes (no real FHE keys). EIP-712 typed data is correctly structured for wallet signatures.

4. **Input proofs** — the `InputProof` blob encodes handle count, handles, and plaintext values. The on-chain `InputVerifier` validates this in cleartext mode.

### Handle format

Each handle is a 32-byte value:

```
[bytes 0–20]   hash (21 bytes) — deterministic from plaintext + context
[byte 21]      index — position within the encrypted input (0, 1, 2, …)
[bytes 22–29]  chainId — uint64 big-endian
[byte 30]      fheTypeId — identifies the encrypted type
[byte 31]      version — always 0
```

Supported FHE types:

| Type       | fheTypeId | Bits |
| ---------- | --------- | ---- |
| `ebool`    | 0         | 2    |
| `euint8`   | 2         | 8    |
| `euint16`  | 3         | 16   |
| `euint32`  | 4         | 32   |
| `euint64`  | 5         | 64   |
| `euint128` | 6         | 128  |
| `eaddress` | 7         | 160  |
| `euint256` | 8         | 256  |

## Low-level API

If you need direct access to the cleartext FHEVM instance (without `ZamaSDK`), use `createCleartextInstance`:

```ts
import { createCleartextInstance } from "@zama-fhe/sdk/cleartext";
import { HardhatConfig } from "@zama-fhe/sdk";

const instance = await createCleartextInstance(HardhatConfig);

// Build encrypted input
const input = instance.createEncryptedInput(contractAddress, userAddress);
input.addBool(true).add64(42n).addAddress("0xf39Fd6…");
const { handles, inputProof } = await input.encrypt();

// Decrypt
const result = await instance.publicDecrypt(
  handles.map((h) => "0x" + Buffer.from(h).toString("hex")),
);
console.log(result.clearValues);
```

### Available methods

| Method                                 | Description                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `createEncryptedInput(contract, user)` | Fluent builder — `addBool`, `add8`…`add256`, `addAddress`, then `encrypt()` |
| `publicDecrypt(handles)`               | Decrypt handles marked for public decryption (checks ACL)                   |
| `userDecrypt(…)`                       | Decrypt handles for a specific user (checks user + contract ACL)            |
| `delegatedUserDecrypt(…)`              | Decrypt on behalf of a delegator                                            |
| `generateKeypair()`                    | Random keypair (for signature flows)                                        |
| `createEIP712(…)`                      | EIP-712 typed data for user decrypt requests                                |
| `createDelegatedUserDecryptEIP712(…)`  | EIP-712 typed data for delegated decrypt requests                           |
| `getPublicKey()`                       | Always `null` (no real FHE)                                                 |
| `getPublicParams()`                    | Always `null` (no real FHE)                                                 |
| `requestZKProofVerification()`         | Always throws — use `encrypt()` instead                                     |

## Limitations

- **No real encryption** — values are stored in plaintext on-chain. Never use cleartext mode in production.
- **No ZK proofs** — `requestZKProofVerification()` throws. Input proofs use a simplified format with `numSigners = 0`.
- **`encrypt()` uses `add64` internally** — `RelayerCleartext.encrypt()` calls `add64` for each value in the `EncryptParams.values` array. For other types, use the low-level `createCleartextInstance` API.
- **Single input limit** — max 2048 bits (e.g. 8 × `uint256`) and 256 variables per encrypted input.

## Hardhat setup

To use cleartext mode with a local Hardhat node, you need the FHEVM contracts deployed in cleartext mode. Add the `@fhevm/solidity` package and deploy with its cleartext configuration:

```bash
pnpm add -D @fhevm/solidity
```

The `HardhatConfig` preset uses deterministic addresses from `@fhevm/solidity`'s `ZamaConfig._getLocalConfig()`, so handles and contract interactions work out of the box once the contracts are deployed.
