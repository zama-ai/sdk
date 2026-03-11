# Narrative Tone & Writing Style

Rules for voice, tone, and prose style in SDK documentation.

## Voice

Use **second person ("you")** as the default voice. Switch to **first person plural ("we")** only during guided walkthroughs where you're building alongside the reader.

```
GOOD (general):  "You can configure the transport by passing options."
GOOD (tutorial): "First, we'll set up the config. Next, we'll wrap the app."
BAD:             "The transport is configured by passing options." (passive)
BAD:             "I recommend configuring the transport." (first person singular)
```

Use **imperative voice** for direct instructions:

```
GOOD: "Create a config.ts file and export a config object."
BAD:  "You should create a config.ts file."
```

### Voice by page type

| Page type          | Primary voice              | Example                                          |
| ------------------ | -------------------------- | ------------------------------------------------ |
| API reference      | Second person              | "Address to get balance for."                    |
| Getting started    | Imperative + "you"         | "Install the package. You can learn more..."     |
| Step-by-step guide | "we"                       | "Next, we'll add the hook."                      |
| Why / Overview     | Declarative                | "The SDK delivers a great developer experience." |
| Migration guide    | Second person + imperative | "Update your imports. You no longer need..."     |

## Tone

**Professional-casual with confidence.** Reads like a knowledgeable colleague explaining clearly — technically precise but not stiff.

### DO

- Make confident, declarative statements: "Performance is critical for applications of all sizes."
- Be direct and efficient: one clear sentence over three hedging ones
- Use parenthetical examples to ground concepts: `(e.g. fetching a block number, reading from a contract)`

### DON'T

- Use humor, slang, or exclamation marks (except sparingly in tutorial wrap-up steps like "Wire it up!")
- Hedge: "you might want to perhaps consider..." → "Use X when..."
- Be condescending: "Simply do X" or "Just add Y" (nothing is "simple" if you need docs for it)
- Use emoji (keep to near-zero usage; reserve only for celebrating TypeScript type inference wins)

## Sentence Structure

Target **10-25 words per sentence**. Never exceed 35 words without structural aids.

```
GOOD: "Performance is critical for applications of all sizes." (8 words)
GOOD: "The SDK follows semver so developers can upgrade between versions with confidence." (11 words)
BAD:  "App developers should not need to worry about managing dozens of different
       authentication providers, the intricacies of token refresh flows, or accidentally
       exposing credentials..." (45 words without a break)
```

When longer sentences are necessary, use **colons, dashes, or parenthetical examples** as structural aids:

```
"Queries are used for fetching data (e.g. fetching a user profile, reading from a data source),
and are typically invoked on mount by default."
```

## Concept Introduction

Follow the pattern: **brief framing → code → post-code commentary**.

1. One-sentence framing of what the reader will see
2. Code block
3. Optional 1-2 sentence commentary with link to deeper docs

```markdown
Create and export a new config using `createConfig`.

[code block]

In this example, the SDK is configured with two data sources. Check out the
`createConfig` docs for more configuration options.
```

Never write multiple paragraphs of explanation before showing code. If concept explanation exceeds 2 sentences, consider a dedicated "Why" or "Overview" page.

## Assumed Knowledge

### Assume the reader knows

- The host framework (React hooks, Vue composables, etc.)
- TypeScript basics (generics, type inference, const assertions)
- Domain fundamentals relevant to your SDK's problem space (e.g. for web3: wallets, transactions, ABIs; for auth: tokens, sessions, OAuth flows)

### Always explain

- SDK-specific APIs and concepts
- Integration points with third-party libraries (e.g. "TanStack Query is an async state manager that handles requests, caching, and more.")
- Non-obvious behavior or gotchas

## Jargon Handling

| Pattern                 | Example                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| SDK term, first use     | Explain inline: "The client is a configured instance that manages connections and caching" |
| Domain term, well-known | Use freely: terms your audience knows (e.g. hook, middleware, schema, endpoint)            |
| Domain term, specific   | Explain when relevant: "A read-only operation returns data without side effects"           |

## Admonitions

Use admonitions for callouts that deserve visual emphasis. Refer to your framework's admonition syntax ([GitBook](references/gitbook.md)).

| Type                     | Use for                            | Example                                                                      |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------- |
| **warning**              | "You must do this or things break" | "Make sure to replace the `projectId` with your own Project ID"              |
| **info**                 | Reassurance or context             | "Not ready to migrate yet? The v1 docs are still available at..."            |
| **tip**                  | Helpful side-information           | "TypeScript doesn't support importing JSON as const yet. Check out the CLI!" |
| **details / expandable** | Optional deeper dives              | TypeScript configuration, advanced patterns                                  |

## "Why" vs "How"

Most SDK docs are practical (tutorials, how-to guides, reference). But **explanation pages** are the fourth essential type — they build the mental model that makes everything else click.

API reference pages have **zero "why"**. They are pure reference. Tutorials and how-to guides have minimal "why" — link out to explanation pages instead.

## Explanation / Concept Pages

Explanation pages answer "Why does this work this way?" and "How does this fit together?" They are the only doc type focused on _understanding_ rather than _doing_.

### When to write an explanation page

- A design decision needs rationale (why hooks over HOCs, why this caching strategy)
- An integration pattern requires mental model (how the SDK interacts with TanStack Query)
- Users keep asking "why" in the same area (signal that procedural docs aren't enough)
- Architecture context would help users make better decisions

### Explanation page template

```
# [Concept Name]

[1-2 paragraph overview: what this concept is and why it matters]

## How it works
[Mental model — how pieces fit together. Diagrams welcome.]

## Design decisions
[Why the SDK does it this way. Tradeoffs considered. Alternatives rejected and why.]

## Relationship to [Related Concept]
[Connect to other parts of the SDK. Cross-link generously.]

## Further reading
[Links to related API reference, how-to guides, external resources]
```

### Explanation page rules

1. **Make connections.** Link concepts to each other. The reader is building a web of understanding, not learning isolated facts.
2. **Provide context and history.** "This approach was chosen because..." / "Before v2, the SDK used X, but..."
3. **Admit tradeoffs.** Don't be promotional. "This adds complexity but gives you control over..." is more trustworthy than "This is the best approach."
4. **Stay bounded.** Resist including step-by-step instructions (that's a how-to guide) or parameter details (that's reference). Link instead.
5. **No code-forward requirement.** Unlike every other page type, explanation pages can be prose-heavy. Code illustrates concepts, not procedures.
6. **Voice: declarative and reflective.** "The caching layer sits between..." not "You should understand that the caching layer..."

## Transition Between Prose and Code

| Pattern                           | When to use                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Declarative sentence → code block | Most common. "Create and export a config." → [code]                                |
| Context-setting → code block      | "Below, we render a list of options. When clicked, `handleSelect` fires." → [code] |
| Code block → post-code commentary | After examples that need explanation. [code] → "In this example, we configured..." |
| "Check out the X docs" send-off   | After every major section to link deeper                                           |

## Parameter Descriptions

In API reference pages, parameter descriptions are **terse fragments**, not full sentences:

```
GOOD: "The resource's schema definition."
GOOD: "Account to use when making the request."
GOOD: "Timestamp to query data at."
BAD:  "This parameter accepts the schema of the resource that you want to interact with."
```
