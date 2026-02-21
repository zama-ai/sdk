# Node.js + viem Example

Minimal Node.js script using `@zama-fhe/token-sdk` with viem.

## Setup

```bash
cp .env.example .env
# Fill in your values in .env

npm install
```

## Run

```bash
npm start
```

## What it does

1. Creates a `ViemSigner` from a private key
2. Sets up `RelayerNode` for FHE operations
3. Checks the confidential balance
4. Shields (wraps) public tokens into confidential tokens
5. Performs a confidential transfer
6. Unshields (unwraps) tokens back to public
7. Cleans up the worker pool

## Authentication

The relayer may require authentication. You can either:

- **Proxy approach**: Run a proxy server that injects auth headers before forwarding to the relayer
- **Direct auth**: Pass an `auth` transport option in the relayer config (see SDK docs)
