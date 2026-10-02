---
title: Supported environments
description: Minimum browser, Node.js, Go, and Rust versions for the SDK.
---

# Supported environments

| Environment        | Minimum version |
| ------------------ | --------------- |
| Chrome             | 105             |
| Edge               | 105             |
| Android WebView    | 105             |
| Chrome for Android | 105             |
| Safari on iOS      | 15.6            |
| Safari             | 15.6            |
| Firefox            | 115             |
| Samsung Internet   | 20              |
| Node.js            | 22              |

## Go and Rust

| Environment | Minimum version or requirement                                                        |
| ----------- | ------------------------------------------------------------------------------------- |
| Go          | 1.25                                                                                  |
| Rust        | 1.94.1                                                                                |
| Daemon host | Linux with a container runtime, sharing a Unix socket directory with your application |

On Docker Desktop, run the application and the daemon as containers sharing a named socket volume. See [Deploy in production](../native/operations/run-in-production.md).

## Next steps

- [Browser security headers](../concepts/security-model.md#browser-security-headers) -- secure context, CSP, and COOP/COEP requirements
