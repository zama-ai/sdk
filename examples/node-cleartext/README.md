# Node.js + Cleartext (Hoodi) Example

Minimal Node.js script using `@zama-fhe/sdk` with viem and the cleartext relayer on Hoodi testnet.

No WASM, no relayer API key, no FHE infrastructure required.

## Setup

```bash
cp .env.example .env
# Fill in your Hoodi contract addresses and private key

npm install
```

## Run

```bash
npm start
```

## What it does

1. Creates a `ViemSigner` from a private key on Hoodi testnet
2. Sets up `RelayerCleartext` with built-in `HoodiConfig` (no API key needed)
3. Checks the confidential balance
4. Shields public tokens into confidential tokens
5. Performs a confidential transfer
6. Unshields tokens back to public
7. Logs final balance and cleans up

## How cleartext mode works

Instead of real FHE encryption, `RelayerCleartext` stores plaintext values on-chain
via the `CleartextFHEVMExecutor` contract. This lets you test the full token flow
without WASM workers or relayer infrastructure.
