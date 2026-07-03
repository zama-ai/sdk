---
title: Build with an LLM
description: Give coding agents grounded Zama SDK context — install the Zama skills, or point agents without skill support at the SDK's llms.txt files.
---

# Build with an LLM

Give your coding agent a grounded view of the Zama SDK so it writes correct FHEVM code instead of guessing. The fastest way is to install the Zama skills; otherwise point your agent at the SDK's [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt) files or connect the docs over MCP.

## Install the Zama skills

The Zama skills give your agent expert, always-current guidance on the protocol and SDK. They live in [`zama-ai/skills`](https://github.com/zama-ai/skills) (separate from this repo) and install as one bundle of three skills that route automatically by what you're working on:

1. **`zama-typescript`** — the TypeScript SDK, React, browser, and Node.js integration. This is the skill that drives SDK work.
2. `zama-solidity` — encrypted Solidity, FHE types, ACL, and ERC-7984.
3. `zama-protocol` — FHEVM concepts, protocol architecture, and planning.

Install once and your agent has all three; ask an SDK question and `zama-typescript` loads automatically.

{% tabs %}
{% tab title="Claude Code" %}

```text
/plugin marketplace add zama-ai/skills
/plugin install zama-protocol@zama-skills
```

Update later with `/plugin marketplace update zama-skills`.

{% endtab %}
{% tab title="Other agents (npx)" %}

```text
npx skills add zama-ai/skills
```

Works with most skill-aware agents. Add `--list` to choose which skills to install. Update later with `npx skills update` — there is no version to pin; any change merged to `zama-ai/skills` is picked up automatically.

{% endtab %}
{% endtabs %}

For Codex, Cursor, or manual setup, see the [skills README](https://github.com/zama-ai/skills).

{% hint style="info" %}
No skill support? Point your agent at the [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt) files below instead.
{% endhint %}

## Give guidance to AI agents / LLMs

The Zama SDK ships as `@zama-fhe/sdk` (and `@zama-fhe/react-sdk` for React) — **not** the legacy `@zama-fhe/relayer-sdk` that most LLM training data still defaults to. Point your agent at the SDK's LLM-ready files to ground it on the current API when it can't use skills — or to pull a specific doc on demand. They give a grounded map of the public docs, approved examples, and SDK reference without cloning the repo.

| File                                                                                      | Use it when                                                                                  | Your agent gets                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt)           | the agent needs to **discover** the right guide, example, or reference, then fetch only that | a compact map of guides, concepts, SDK and React reference pages, and approved examples   |
| [`llms-full.txt`](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms-full.txt) | the agent has a **large context window** and you want the whole public corpus in one paste   | the complete docs bundle plus approved examples and README context (API reports excluded) |

Start with [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt) for normal coding tasks; reach for [`llms-full.txt`](https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms-full.txt) only when you want everything loaded at once. The `source_path` values such as `docs/gitbook/src/...` are provenance metadata, not local paths — if you haven't cloned the repo, use the raw GitHub URLs.

### Example prompts

To ground an agent, paste:

> You're building with the Zama SDK — `@zama-fhe/sdk` (and `@zama-fhe/react-sdk` for React), not the legacy `@zama-fhe/relayer-sdk`. Read https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt and follow its links to the relevant guides and approved examples before writing any code. Treat the official docs as the source of truth, prefer the official examples listed in llms.txt over ad hoc implementations, and use the API reference only to confirm exact signatures.

Then give it a task. (With the skills installed your agent is already grounded — skip straight here.)

{% tabs %}
{% tab title="React (wagmi)" %}

> Read https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt and follow its links to the relevant Zama SDK guides and approved examples before writing any code.
>
> Add confidential balances and transfers to this Next.js app, following the approved `react-wagmi` example.

{% endtab %}
{% tab title="Node.js" %}

> Read https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt and follow its links to the relevant Zama SDK guides and approved examples before writing any code.
>
> Build a Node.js backend with the `node()` transport and per-request isolation, following the approved `node-viem` example.

{% endtab %}
{% tab title="Debugging" %}

> Read https://raw.githubusercontent.com/zama-ai/sdk/prerelease/llms.txt and follow its links to the relevant Zama SDK guides and approved examples before writing any code.
>
> Debug this Zama SDK integration: read the error handling guide (https://docs.zama.org/protocol/sdk/alpha/guides/handle-errors.md) — it covers catching, matching, and recovering from SDK errors — diagnose against it, then compare with the closest official example.

{% endtab %}
{% endtabs %}

## Connect the docs over MCP

Every page in these docs has a **Copy ▾** menu (top-right) with built-in agent connectors — reach for these when you want live access to the current docs rather than a static paste:

- **Connect with MCP** — add the docs as an MCP server in Claude Code, Cursor, VS Code, or Codex for live, searchable access to the current API. Stronger than `llms.txt` for MCP-capable agents, since it always reflects the published docs.
- **Open in ChatGPT** / **Open in Claude** — start a chat already grounded on the page you're viewing.
- **Copy page as Markdown** / **View as Markdown** — grab a single page as plain markdown for your agent, or append `.md` to any docs URL (e.g. `https://docs.zama.org/protocol/sdk/alpha/overview.md`).
