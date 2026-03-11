# Local Preview with mdbook

The docs are written in GitBook markdown syntax. For local preview, we use [mdbook](https://rust-lang.github.io/mdBook/) with a custom preprocessor that converts GitBook template tags to HTML at build time.

## Setup

```bash
# Install mdbook (if not already)
brew install mdbook  # or: cargo install mdbook

# Serve locally with live reload
cd docs/gitbook
mdbook serve -p 4000
```

Preview at **http://localhost:4000**.

## How it works

Source files use GitBook syntax (`{% tabs %}`, `{% hint %}`, `{% include %}`). A Node.js preprocessor (`scripts/mdbook-gitbook-preprocessor.mjs`) converts these to plain HTML before mdbook renders them.

| GitBook syntax                              | Preprocessor output                       |
| ------------------------------------------- | ----------------------------------------- |
| `{% tabs %}` / `{% tab title="..." %}`      | Interactive HTML tabs with JS             |
| `{% hint style="info" %}`                   | Styled callout `<div>`                    |
| `{% include ".gitbook/includes/file.md" %}` | Inlined content                           |
| YAML frontmatter (`---`)                    | Stripped                                  |
| ` ```tsx ` code blocks                      | Remapped to `typescript` for highlight.js |

## Key files

```
book.toml                              # mdbook config
scripts/mdbook-gitbook-preprocessor.mjs  # GitBook → HTML preprocessor
theme/gitbook.css                      # Custom styles (hints, tabs, typography)
theme/tabs.js                          # Tab click + code re-highlighting
SUMMARY.md                             # Navigation (shared with GitBook)
.gitbook.yaml                          # GitBook git sync config
.gitbook/includes/                     # Reusable content fragments
```

## Notes

- Source markdown is **not modified** — the preprocessor only transforms at build time.
- When pushed to GitBook via git sync, everything renders natively (no preprocessor needed).
- mdbook's `build/` output dir is gitignored.
