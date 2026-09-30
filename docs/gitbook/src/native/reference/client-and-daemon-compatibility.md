---
description: Match Go or Rust client versions with the Zama SDK daemon image.
---

# Client and daemon compatibility

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

Run the daemon image and your Go or Rust client at exactly the same version. Upgrade the image and clients together; matching only the major and minor versions is insufficient.

| Artifact     | Location                               |
| ------------ | -------------------------------------- |
| Daemon image | `zamafhe/sdk-daemon` on Docker Hub     |
| Rust crate   | `zama_sdk` on crates.io                |
| Go module    | `github.com/zama-ai/sdk/clients/go/v3` |

The quickstarts use unversioned installation commands, and the daemon image without a tag selects `latest`.

For deployments, record the selected client version and pin the daemon image to its matching release tag. Do not rely on a moving image tag when restarting an existing deployment. Retain the Go module files or your Rust application's lockfile to reproduce the selected dependencies.

The wire protocol is named `v1beta1`. This identifier does not select an SDK release channel or replace the exact-version pairing rule.

Start with the [Go quick start](../tutorials/go-quick-start.md) or [Rust quick start](../tutorials/rust-quick-start.md). Read [Upgrade the daemon](../operations/upgrade-and-recover.md) before changing an existing deployment.
