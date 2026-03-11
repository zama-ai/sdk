---
name: sdk-documentation
description: >-
  Rules and patterns for writing comprehensive, high-quality SDK documentation for public libraries.
  Covers documentation architecture, narrative tone, user guides, and API references.
  Use when: (1) Writing or reviewing documentation for a public SDK/library,
  (2) Creating API reference pages for hooks/functions/classes,
  (3) Writing getting-started guides or tutorials,
  (4) Structuring a documentation site from scratch,
  (5) Reviewing documentation quality and consistency,
  (6) Setting up a GitBook documentation site for an SDK.
---

# SDK Documentation Best Practices

Rules for writing clear, scannable, code-forward documentation for public SDKs.
Derived from analysis of best-in-class SDK documentation (wagmi, viem, TanStack). Rules are domain-agnostic; examples use generic SDK patterns with occasional web3 illustrations.

## Documentation Type Router

Before writing, identify which type of page you're creating. Each type has different rules.

| Question you're answering           | Doc type                           | Template                                          | Key rule                                                                        |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| "Help me learn this SDK"            | **Tutorial** (Getting Started)     | [guides.md → Tutorials](references/guides.md)     | Learning-oriented: guide the reader, eliminate choices, show destination early  |
| "Help me accomplish X"              | **How-to Guide** (Task Guide)      | [guides.md → How-to Guides](references/guides.md) | Task-oriented: assume competence, action-only, address real-world complexity    |
| "What does X do / accept / return?" | **API Reference**                  | [api-reference.md](references/api-reference.md)   | Information-oriented: describe only, zero explanation, mirror product structure |
| "Why does X work this way?"         | **Explanation** (Concept/Why page) | [tone.md → Explanation Pages](references/tone.md) | Understanding-oriented: provide context, make connections, admit tradeoffs      |

**The cardinal sin is mixing types.** A tutorial that stops to explain architecture loses the learner. A reference page that teaches loses the practitioner looking up a parameter. An explanation page that includes step-by-step instructions belongs in a how-to guide.

## Core Philosophy

| Principle                | Meaning                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| Code is the star         | Prose exists to introduce, contextualize, and connect code examples |
| Scannable over narrative | Readers skim for answers; structure for rapid lookup                |
| Show, don't tell         | Diff annotations and working examples beat explanations             |
| One concept per step     | Never introduce multiple ideas simultaneously                       |
| Full files, not snippets | Every code block should be runnable in isolation                    |
| Template rigidly         | Predictable structure is a feature, not a limitation                |

## Quick Reference: Critical Rules

| Category        | DO                                                                       | DON'T                             |
| --------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Voice           | "you" for concepts, "we" for tutorials                                   | Passive voice                     |
| Tone            | Professional-casual, confident                                           | Humorous, condescending, or stiff |
| Sentences       | 10-25 words, active voice                                                | 35+ word run-on sentences         |
| Code examples   | Complete runnable files with focus annotations                           | Partial snippets missing context  |
| Parameters      | One `###` heading per param with full example                            | Tables or lists of parameters     |
| Optional params | Indicate via `\| undefined` in type                                      | "Optional" badges or markers      |
| Jargon          | SDK-specific terms explained; ecosystem terms assumed                    | Over-explaining industry basics   |
| Sections        | Rigid ordering: Import → Usage → Parameters → Return Type                | Freeform section ordering         |
| Cross-refs      | Link to related APIs inline and in dedicated sections                    | "See also" dump at bottom         |
| Warnings        | Use a warning admonition for critical info (see your framework's syntax) | Inline bold warnings in prose     |

## Detailed Guidance by Topic

- **Documentation structure**: See [references/structure.md](references/structure.md) for site architecture, page templates, navigation, shared content systems
- **Narrative tone & explanation pages**: See [references/tone.md](references/tone.md) for voice, style, sentence patterns, jargon handling, and explanation/concept page guidance
- **Tutorials & how-to guides**: See [references/guides.md](references/guides.md) for tutorial rules (learning-oriented), how-to guide rules (task-oriented), progressive disclosure, framework variants
- **API references**: See [references/api-reference.md](references/api-reference.md) for parameter docs, return types, TypeScript presentation, cross-referencing
- **GitBook setup**: See [references/gitbook.md](references/gitbook.md) for Git Sync, content blocks, steppers, OpenAPI integration, reusable content
