# Node.js + ethers Example

Minimal Node.js script using `@zama-fhe/sdk` with ethers v6.

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

1. Creates an `EthersSigner` from a private key
2. Sets up `RelayerNode` for FHE operations
3. Checks the confidential balance
4. Shields public tokens into confidential tokens
5. Performs a confidential transfer
6. Unshields tokens back to public
7. Cleans up the worker pool

## Authentication

The relayer may require authentication. You can either:

- **Proxy approach**: Run a proxy server that injects auth headers before forwarding to the relayer
- **Direct auth**: Pass an `auth` transport option in the relayer config (see SDK docs)
