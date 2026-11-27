---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

### Daemon

**The Go and Rust clients connect only to a daemon that runs as their own UID.** An application that runs as another user, such as root, now fails to connect with `daemon socket peer runs as UID …, expected UID …`. Run it as the daemon's UID. The Go client refuses to connect on platforms other than Linux and macOS. The container healthcheck now also fails when the socket file does not belong to the user it runs as. See [Client cannot connect to the daemon](../native/operations/monitor-and-troubleshoot.md#client-cannot-connect-to-the-daemon).
