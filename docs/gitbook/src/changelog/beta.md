---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

### Daemon

**The Go and Rust clients connect only to a daemon that runs as their own UID.** On each connection to the daemon socket, the clients read the UID of the process on the other end and close the connection when it differs from the application's. An application that runs as another user, such as root, now gets `daemon socket peer runs as UID …, expected UID …`: run it as the daemon's UID. The Go client makes this check on Linux and macOS and returns an error on other platforms. The container healthcheck also requires the socket file to belong to the daemon's user.
