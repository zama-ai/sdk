---
title: Release channels
description: What stable, beta, and alpha mean for @zama-fhe/sdk, and where to find what changed in each.
---

# Release channels

`@zama-fhe/sdk` and `@zama-fhe/react-sdk` publish to three npm dist-tags, one per branch:

| Channel    | Install                     | Branch  | Tracks                                      |
| ---------- | --------------------------- | ------- | ------------------------------------------- |
| **Stable** | `npm i @zama-fhe/sdk`       | `main`  | Currently deployed mainnet/testnet protocol |
| **Beta**   | `npm i @zama-fhe/sdk@beta`  | `beta`  | Currently deployed mainnet/testnet protocol |
| **Alpha**  | `npm i @zama-fhe/sdk@alpha` | `alpha` | Upcoming, not-yet-deployed protocol changes |

Stable and beta both target the protocol version actually running on mainnet and testnet today — beta simply carries changes that haven't had a stable release yet. **Alpha is different in kind, not just in stability.** It tracks upcoming protocol changes that aren't deployed anywhere yet, closer to a DevNet than a "more bleeding-edge beta." Code that works on alpha can depend on protocol behavior that doesn't exist on any network you can actually reach yet.

{% hint style="warning" %}
If you didn't pick `alpha` on purpose, you almost certainly want `beta` or stable instead.
{% endhint %}

## What's covered here

This changelog section covers `main` and `beta` — the two lines with real deployments behind them:

- [**Beta (unreleased)**](beta.md) — changes on `beta` that haven't shipped in a stable release yet.
- [**3.x (current)**](v3.md) — plain-language release notes for the current stable major line, one page per minor version.
- [**Legacy versions**](legacy.md) — release notes for superseded major versions.

`alpha` doesn't get its own page or docs space here: its commits aren't written up until they're synced into `beta`, or reach a stable release on `main`.
