# Cleartext Mode

Cleartext mode lets you develop and test your dApp locally without WASM or FHE infrastructure. Values are stored in plaintext on-chain via a `CleartextFHEVMExecutor` contract — your code uses the exact same API as production, but runs instantly.

## Quick start

### 1. Install

```bash
pnpm add @zama-fhe/sdk
```

### 2. Set up a local Hardhat node

```bash
cd hardhat
pnpm add @fhevm/solidity @openzeppelin/contracts @openzeppelin/contracts-upgradeable
pnpm add -D @fhevm/hardhat-plugin hardhat-deploy
```

Import the plugin in `hardhat.config.ts`:

```ts
import "@fhevm/hardhat-plugin";
import "hardhat-deploy";
```

Start the node — FHEVM contracts deploy automatically:

```bash
pnpm hardhat node --network hardhat
```

### 3. Use the SDK

For single-chain setups (the common case), pass the config directly — no `getChainId` or `transports` needed:

```ts
import { HardhatConfig, ZamaSDK, MemoryStorage } from "@zama-fhe/sdk";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const sdk = new ZamaSDK({
  relayer: new RelayerCleartext(HardhatConfig),
  signer: new EthersSigner({ signer: ethersSigner }),
  storage: new MemoryStorage(),
});

// Same API as production — shield, transfer, decrypt
const token = sdk.createToken("0xYourEncryptedERC20");
await token.shield(1000n);
const balance = await token.balanceOf();
```

For multi-chain setups, use the `getChainId` + `transports` form:

```ts
const signer = new EthersSigner({ signer: ethersSigner });
const relayer = new RelayerCleartext({
  getChainId: async () => 31337,
  transports: {
    31337: { network: "http://127.0.0.1:8545" },
  },
});
```

### React

```tsx
import { ZamaProvider, RelayerCleartext, HardhatConfig, MemoryStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });
const relayer = new RelayerCleartext(HardhatConfig);

function App() {
  return (
    <ZamaProvider relayer={relayer} signer={signer} storage={new MemoryStorage()}>
      <MyTokenPage />
    </ZamaProvider>
  );
}
```

All React hooks (`useConfidentialBalance`, `useConfidentialTransfer`, etc.) work identically.

## Switching to production

Swap the relayer — no other code changes needed:

```ts
import { RelayerWeb, HardhatConfig } from "@zama-fhe/sdk";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";

function createRelayer(getChainId: () => Promise<number>) {
  if (process.env.FHEVM_MODE === "cleartext") {
    return new RelayerCleartext(HardhatConfig);
  }

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

## Configuration

For Hardhat (31337) and Hoodi (560048), built-in presets provide all contract addresses. You only need `network`:

```ts
// Hardhat — single-transport (simplest)
new RelayerCleartext({ chainId: 31337, network: "http://127.0.0.1:8545" });

// Hoodi testnet
new RelayerCleartext({ chainId: 560048, network: "https://rpc.hoodi.ethpandaops.io" });
```

For custom deployments, provide the full config:

```ts
new RelayerCleartext({
  chainId: 99999,
  gatewayChainId: 10901,
  network: "http://your-custom-node:8545",
  aclContractAddress: "0x...",
  kmsContractAddress: "0x...",
  inputVerifierContractAddress: "0x...",
  verifyingContractAddressDecryption: "0x...",
  verifyingContractAddressInputVerification: "0x...",
  cleartextExecutorAddress: "0x...",
});
```

## Limitations

- **Never use in production** — values are stored in plaintext on-chain.
- **No ZK proofs** — `requestZKProofVerification()` throws. Use `encrypt()` instead.
- **Input size limit** — max 256 values per encrypted input (2048 bits total).
