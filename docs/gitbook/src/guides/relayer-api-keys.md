---
title: Relayer API keys
description: How to obtain, configure, and securely manage your Zama Relayer API key.
---

# Relayer API keys

The Relayer API key provides secure access to Zama's hosted Relayer service on mainnet. This guide explains how to obtain and use your API key.

{% hint style="info" %}
Only the Zama-hosted **mainnet** relayer needs an API key. On **Sepolia testnet** the relayer is open — the `sepolia` preset works with no key, so you can build and test the full flow before requesting one.
{% endhint %}

## Overview

There are two options to access the FHEVM Relayer for mainnet deployment:

**Self-hosted Relayer:** Deploy and operate your own Relayer instance, fund your own gateway wallet, and handle transactions independently. See the [Self-host Relayer](https://github.com/zama-ai/fhevm/blob/main/relayer/docs/SELF_HOSTING.md) documentation for set-up guides and configuration references.

**Zama-hosted Relayer:** Connect to Zama's hosted Relayer using an API key for authentication. Transaction fees will be billed on a monthly basis according to the usage, with possible discounts and grants applied directly in the invoice.

Start by submitting the form below, the Zama team will review your request and contact you with next steps.

→ [Apply for an API key](https://forms.gle/jq84zEek1oiv3kBz9)

{% hint style="warning" %}
Before publishing your solution on mainnet, ensure that end-to-end integration has been successfully tested on testnet.
{% endhint %}

## Using your API key

Once you receive your API key, wire it into the SDK using one of the two strategies covered in the [Authentication guide](authentication.md):

- **Backend proxy** (recommended for browser apps) — the proxy injects the `x-api-key` header so the key never reaches the client.
- **Direct API key** (server-side apps only) — pass the key in the relayer transport's `auth` field as `{ __type: "ApiKeyHeader", value: ... }`.

A direct API key reads the key from the environment and sets it on the chain:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const mySepolia = {
  ...sepolia,
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
  auth: { __type: "ApiKeyHeader" as const, value: process.env.RELAYER_API_KEY! },
} as const satisfies FheChain;
```

{% endtab %}
{% tab title="Go" %}

```go
config := zama.NewSDKConfig(11155111, "https://sepolia.infura.io/v3/YOUR_KEY")
config.Auth = zama.APIKeyHeader{Value: os.Getenv("RELAYER_API_KEY")}
```

{% endtab %}
{% tab title="Rust" %}

```rust
let chain = ChainConfig::new(11_155_111, "https://sepolia.infura.io/v3/YOUR_KEY")
    .with_auth(RelayerAuth::api_key(env::var("RELAYER_API_KEY")?));
```

{% endtab %}
{% endtabs %}

For the Zama-hosted relayer, `ApiKeyHeader` is the supported `auth` method — the hosted endpoint accepts the key only in the `x-api-key` header. (`BearerToken` and `ApiKeyCookie` apply to self-hosted relayers or proxied setups.)

The Authentication guide includes copy-paste examples for both, an Express proxy reference implementation, and the full table of supported `auth` methods.

## Security best practices

Your API key grants access to Zama's hosted Relayer with sponsored operations. Follow these security guidelines to protect your key:

### Keep your key private

- **Never expose your API key in client-side code** (frontend applications, mobile apps, etc.)
- **Never commit your API key** to version control systems
- **Never share your API key** with unauthorized parties

### Secure implementation

The recommended approach depends on your application architecture:

- **In-browser applications**: Proxy all Relayer requests through your backend server so the API key remains server-side and never reaches the client.
- **Server-side applications**: Store the API key in environment variables and load it securely at runtime.

### Backend proxy pattern

The proxy must add the `x-api-key` header to every forwarded request, so the key stays server-side and your frontend never sees it. It should also pass through the `x-zama-sdk-*` headers the SDK sets, so [SDK usage telemetry](telemetry.md) still reaches the relayer. See the [Authentication guide](authentication.md) for a working Express proxy and the matching client-side `relayerUrl` configuration — the patterns there apply unchanged when the upstream is the Zama-hosted Relayer.

## Compromised keys

If you suspect your API key has been compromised:

1. **Immediately notify the Zama team** through [support@zama.org](mailto:support@zama.org).
2. **Request a new API key** from the Zama team
3. **Stop using the compromised key** in your applications

If Zama identifies that an API key has been compromised, the key holder will be notified immediately and the key may be suspended to prevent unauthorized usage.

## Next steps

- [Authentication](authentication.md) — wire your API key into the SDK via a backend proxy or direct `auth` field
- [Configuration](configuration.md) — full relayer, signer, and storage setup
