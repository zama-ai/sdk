# Daemon and native clients

## Where docs live

- Daemon-only pages (quickstarts, wallet and storage callbacks, events, recovery, operations, references, concepts) live in `docs/gitbook/src/native/`.
- Shared tasks live in `docs/gitbook/src/guides/` with Go and Rust tabs next to Core SDK and React SDK. The Configuration guide carries Go and Rust tabs, including the daemon connection.
- Follow `zama-developer:sdk-documentation` and [conventions](conventions.md), except the TypeScript reference template: the Go and Rust reference comes from godoc and rustdoc.
- Contributor build, code generation, and test instructions belong in `CONTRIBUTING.md`.
- Daemon release notes follow the [changelog conventions](changelog.md) (`## Daemon` on the Beta page).

## Availability rules

- Add a Go or Rust tab to a code block only when that exact operation exists in the client. Never add placeholder tabs.
- Mark a TypeScript-only section or guide once, at its top, with `{% hint style="info" %}Available in the Core SDK and React SDK.{% endhint %}`. Delete the hint and add tabs when the native operation ships.
- Never document a workaround below a missing API. If a flow needs an SDK method the clients don't expose, the section stays TypeScript-only.
- Keep shared prose language-neutral. Pair a TypeScript error class with its code, for example `DelegationExpirationTooSoonError` (`DELEGATION_EXPIRATION_TOO_SOON`).
- A tab contains code and at most one line on a language-specific difference. Use the same inputs and produce the same result as the Core SDK tab.
- When `Token` or `WrappedToken` ships in the clients, add tabs to the existing token guides instead of creating native token pages.

## Product facts

- The clients don't expose `Token` or `WrappedToken`.
- Supported topology: one daemon per application instance, on the same host or in the same pod, same UID, private socket directory, one trust domain per daemon. No network listener. SDK contexts are not tenant boundaries.
- Daemon SQLite stores are locked to one daemon; give each daemon its own volume. Replicas can share application-owned storage, but credential coordination doesn't span daemons.
- Crate `zama_sdk`, Go module `github.com/zama-ai/sdk/clients/go/v3`, image `zamafhe/sdk-daemon`. Install commands pin one `ZAMA_SDK_VERSION` (`export ZAMA_SDK_VERSION=<version>`, `go get …@v$ZAMA_SDK_VERSION`, `cargo add zama_sdk@=$ZAMA_SDK_VERSION`, image tag `:<version>`); `scripts/release/prepare-lockstep.mjs` rewrites them on each release, so keep those exact forms and keep them out of tables. The client and the daemon image must match exactly.
- Call the daemon and its clients experimental, independent of the release channel. `v1beta1` is only the wire protocol name. Show the experimental hint only on the overview, the quickstarts, the "Go & Rust clients" landing page, the compatibility reference, and the deployment page.

## Banned in partner-facing pages

- Build-log narration and test commands.
- "Handle" for an encrypted value, except in exact interface identifiers.
- Hedging disclaimers such as "not exercised on your infrastructure".
- Wire internals such as "the bridge" or omitted-versus-empty map semantics.
