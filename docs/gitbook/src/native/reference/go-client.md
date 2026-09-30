---
description: Find generated API documentation and public interfaces for the Go daemon client.
---

# Go client API

The Go package documentation describes the native public interfaces, signatures, and exported types.

After installing the client, print the package reference from your application module:

```sh
go doc -all github.com/zama-ai/sdk/clients/go/v3
```

Look up a specific operation with its exported type or method:

```sh
go doc github.com/zama-ai/sdk/clients/go/v3.SDKContext.Encrypt
```

`Dial` creates a `Client`; `Client.CreateContext` creates an `SDKContext`. Configuration uses `SDKConfig`, `ChainConfig`, and `SignerConfig`.

The `SDKContext` exposes encryption, decryption, permit management, delegation, and offline preparation methods directly. `Close` releases the context; `Client.Close` closes the connection.
