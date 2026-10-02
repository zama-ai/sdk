---
description: Find generated API documentation and public interfaces for the Rust daemon client.
---

# Rust client API

Rustdoc describes the native public interfaces, signatures, and exported types.

After installing the Rust client in your application, generate and open its reference:

```sh
cargo doc -p zama_sdk --no-deps --open
```

`Client::connect` creates a `Client`; `Client::sdk` returns an `SdkBuilder`; `SdkBuilder::build` creates an `Sdk`. Configuration uses `SdkConfig` and `ChainConfig`, with signer and storage configuration on the builder.

The `Sdk` exposes encryption directly. Its `decryption()`, `permits()`, and `offline()` accessors provide operation groups; delegation lives under `sdk.delegations()`. `Sdk::close` releases the context and callback resources.

Enable the `alloy` feature on your application's `zama_sdk` dependency before generating documentation to include Alloy signing and transaction adapters.
