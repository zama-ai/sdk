---
title: Build with an LLM
description: Give coding agents grounded Zama SDK context — install the Zama skills, or point agents without skill support at the SDK's llms.txt files.
---

# Build with an LLM

Give your coding agent a grounded view of the Zama SDK so it writes correct FHEVM code instead of guessing. The fastest way is to install the Zama skills; if your agent doesn't support skills, point it at the SDK's `llms.txt` files instead.

## Install the Zama skills

The Zama skills give your agent expert, always-current guidance on the protocol and SDK. They live in [`zama-ai/skills`](https://github.com/zama-ai/skills) (separate from this repo) and install as one bundle of three skills that route automatically by what you're working on:

- **`zama-typescript`** — the TypeScript SDK, React, browser, and Node.js integration. This is the skill that drives SDK work.
- `zama-solidity` — encrypted Solidity, FHE types, ACL, and ERC-7984.
- `zama-protocol` — FHEVM concepts, protocol architecture, and planning.

Install once and your agent has all three; ask an SDK question and `zama-typescript` loads automatically.

{% tabs %}
{% tab title="Claude Code" %}

```text
/plugin marketplace add zama-ai/skills
/plugin install zama-protocol@zama-skills
```

{% endtab %}
{% tab title="Other agents (npx)" %}

```text
npx skills add zama-ai/skills
```

Works with most skill-aware agents. Add `--list` to choose which skills to install.

{% endtab %}
{% endtabs %}

For Codex, Cursor, or manual setup, see the [skills README](https://github.com/zama-ai/skills).

{% hint style="info" %}
No skill support? Point your agent at the `llms.txt` files below instead.
{% endhint %}

## Use llms.txt

Point your agent at the SDK's LLM-ready files when it can't use skills — or to pull a specific doc on demand. They give a grounded map of the public docs, approved examples, and SDK reference without cloning the repo.

| File                                                                                | Use it when                                                                                  | Your agent gets                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`llms.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt)           | the agent needs to **discover** the right guide, example, or reference, then fetch only that | a compact map of guides, concepts, SDK and React reference pages, and approved examples   |
| [`llms-full.txt`](https://raw.githubusercontent.com/zama-ai/sdk/main/llms-full.txt) | the agent has a **large context window** and you want the whole public corpus in one paste   | the complete docs bundle plus approved examples and README context (API reports excluded) |

Start with `llms.txt` for normal coding tasks; reach for `llms-full.txt` only when you want everything loaded at once. The `source_path` values such as `docs/gitbook/src/...` are provenance metadata, not local paths — if you haven't cloned the repo, use the raw GitHub URLs.

To ground an agent, paste:

> Read https://raw.githubusercontent.com/zama-ai/sdk/main/llms.txt and follow its links to the relevant Zama SDK guides and approved examples before writing any code.

Then give it a task. (With the skills installed your agent is already grounded — skip straight here.)

{% tabs %}
{% tab title="React (wagmi)" %}

> Add confidential balances and transfers to this Next.js app, following the approved `react-wagmi` example.

{% endtab %}
{% tab title="Node.js" %}

> Build a Node.js backend with the `node()` transport and per-request isolation, following the approved `node-viem` example.

{% endtab %}
{% tab title="Debugging" %}

> Debug this Zama SDK integration: check the official error guide first, then compare against the closest approved example.

{% endtab %}
{% endtabs %}

## Agent guidance

### Source of truth

Whichever path you use, agent guidance follows one source order:

1. **Official documentation** — published through GitBook from `docs/gitbook/src`.
2. **Approved official examples** — listed in the `Official Examples` section of `llms.txt`.
3. **API reports** — fallback only, for exported-API details.

Prefer docs over examples when the docs already answer the question, and prefer the approved examples in this repo over ad hoc implementations.

### Recommended workflows

- **New integration** — install the skills, read the closest approved example, then open the matching guide for detail.
- **Deeper grounding** — load `llms-full.txt` (or follow the `llms.txt` links), and fall back to API reports only for exported-surface questions.
- **Debugging** — start with the [error guide](../guides/handle-errors.md), compare against the closest approved example, and inspect API reports last.
