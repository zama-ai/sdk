# Native clients

These clients expose daemon operations to Go and Rust applications; load [daemon guidance](../docs/agents/daemon.md) before changing their documentation or public surface.

The stack is a Node.js gRPC daemon, Go and Rust clients over a Unix socket, and a protobuf contract.

From the repository root, use `pnpm daemon:generate`, `sh clients/go/generate.sh`, and `cargo run --manifest-path clients/rust/Cargo.toml -p zama-sdk-codegen --locked` for generation. Enable native integration tests with `ZAMA_SDK_DAEMON_NATIVE_TESTS=1 pnpm daemon:test`.
