# GitBook Setup for SDK Documentation

Setup guide for GitBook with all content blocks and features useful for SDK documentation.

## Project Structure

### With Git Sync (recommended for SDKs)

GitBook can sync bidirectionally with a GitHub/GitLab repo. This is the preferred workflow for SDK docs — edit locally in your IDE, push, and GitBook renders.

```
docs/
  .gitbook.yaml          # Git Sync configuration
  README.md              # Homepage
  SUMMARY.md             # Table of contents / sidebar
  getting-started.md
  guides/
    README.md            # Guides section landing page
    authentication.md
    data-fetching.md
  api/
    README.md            # API section landing page
    hooks/
      README.md
      useQuery.md
      useMutation.md
    config/
      createConfig.md
  concepts/              # Explanation pages
    architecture.md
    caching.md
  .gitbook/
    includes/            # Reusable content blocks (auto-managed)
      shared-params.md
      shared-returns.md
```

### `.gitbook.yaml`

```yaml
root: ./docs/

structure:
  readme: README.md
  summary: SUMMARY.md
```

- **`root`**: Directory where GitBook looks for docs (relative to repo root)
- **`structure.readme`**: Homepage file (default: `README.md`)
- **`structure.summary`**: Table of contents file (default: `SUMMARY.md`)

### `SUMMARY.md`

Controls sidebar navigation. Headings create groups, bullets create pages, indentation creates nesting:

```markdown
# Summary

## Getting Started

- [Introduction](README.md)
- [Quick Start](getting-started.md)

## Guides

- [Guides Overview](guides/README.md)
  - [Authentication](guides/authentication.md)
  - [Data Fetching](guides/data-fetching.md)

## API Reference

- [API Overview](api/README.md)
  - [Hooks](api/hooks/README.md)
    - [useQuery](api/hooks/useQuery.md)
    - [useMutation](api/hooks/useMutation.md)
  - [Configuration](api/config/createConfig.md)

## Concepts

- [Architecture](concepts/architecture.md)
- [Caching](concepts/caching.md)
```

**Rules:**

- A file **not listed** in SUMMARY.md won't appear in GitBook
- A file **cannot appear twice** in SUMMARY.md
- `folder/README.md` serves as the folder's landing page
- Override sidebar title: `* [Page Title](page.md "Sidebar Display Title")`
- Without a SUMMARY.md, GitBook infers structure from folder hierarchy

## Content Blocks Reference

GitBook uses Liquid-style `{% %}` tags for special blocks. These are the ones most useful for SDK docs.

### Code Blocks

Standard fenced code blocks with syntax highlighting:

````markdown
```typescript
import { createClient } from "my-sdk";

const client = createClient({ apiKey: "sk_..." });
```
````

**Enhanced code blocks** with title, line numbers, and wrapping:

````markdown
{% code title="config.ts" overflow="wrap" lineNumbers="true" %}

```typescript
import { createConfig } from "my-sdk";

export const config = createConfig({
  baseUrl: "https://api.example.com",
  timeout: 5000,
});
```

{% endcode %}
````

| Option                | Effect                                       |
| --------------------- | -------------------------------------------- |
| `title="filename.ts"` | Caption at top of block (use for filenames)  |
| `lineNumbers="true"`  | Toggle line numbers                          |
| `overflow="wrap"`     | Wrap long lines instead of horizontal scroll |

**Expandable code blocks**: Blocks over 10 lines auto-collapse with an expand button — useful for full file examples.

### Tabs (Code Groups)

Show the same example in multiple languages or package managers:

````markdown
{% tabs %}
{% tab title="pnpm" %}

```bash
pnpm add my-sdk
```
````

{% endtab %}
{% tab title="npm" %}

```bash
npm install my-sdk
```

{% endtab %}
{% tab title="yarn" %}

```bash
yarn add my-sdk
```

{% endtab %}
{% endtabs %}

````

Tabs can contain **any block type** — not just code. Use for framework variants:

```markdown
{% tabs %}
{% tab title="React" %}
```tsx
import { useQuery } from 'my-sdk/react'

function App() {
  const { data } = useQuery({ key: 'users' })
  return <div>{data?.name}</div>
}
````

{% endtab %}
{% tab title="Vue" %}

```vue
<script setup>
import { useQuery } from "my-sdk/vue";

const { data } = useQuery({ key: "users" });
</script>
```

{% endtab %}
{% endtabs %}

````

### Hints (Admonitions)

Four styles for callout blocks:

```markdown
{% hint style="info" %}
The client automatically retries failed requests up to 3 times.
{% endhint %}

{% hint style="warning" %}
You must replace the `apiKey` with your own key from the dashboard.
{% endhint %}

{% hint style="danger" %}
This method deletes data permanently. There is no undo.
{% endhint %}

{% hint style="success" %}
Your SDK is now configured and ready to use.
{% endhint %}
````

| Style     | Use for (in SDK docs)                               |
| --------- | --------------------------------------------------- |
| `info`    | General tips, default behavior notes                |
| `warning` | Required config, breaking behavior, "you must do X" |
| `danger`  | Destructive operations, security-critical info      |
| `success` | Completion confirmations in tutorials               |

Custom icons via Font Awesome:

```markdown
{% hint style="info" icon="books" %}
See the full API reference for all available options.
{% endhint %}
```

### Stepper (Step-by-Step Guides)

Purpose-built for tutorials and getting-started pages:

````markdown
{% stepper %}
{% step %}

### Install the SDK

```bash
pnpm add my-sdk
```
````

{% endstep %}

{% step %}

### Create a config

{% code title="config.ts" lineNumbers="true" %}

```typescript
import { createConfig } from "my-sdk";

export const config = createConfig({
  baseUrl: "https://api.example.com",
});
```

{% endcode %}
{% endstep %}

{% step %}

### Use in your app

```typescript
import { config } from "./config";
import { getData } from "my-sdk";

const result = await getData(config, { id: "123" });
console.log(result);
```

{% endstep %}
{% endstepper %}

````

**Rules:**
- Steps can contain code blocks, images, hints — most block types
- Cannot nest expandable blocks or other steppers inside
- Use for tutorials (Getting Started) and task guides

### Expandable (Details/Accordion)

Collapse advanced content for progressive disclosure:

```markdown
<details>
<summary>Advanced TypeScript configuration</summary>

To enable strict type inference, add the following to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
````

</details>
```

Add `open` attribute to expand by default:

```markdown
<details open>
<summary>Default configuration</summary>
Content visible on load.
</details>
```

### Cards (Navigation)

Link cards for "Next Steps" sections or section landing pages:

```markdown
<table data-view="cards">
<thead>
<tr>
<th></th>
<th></th>
<th data-hidden data-card-target data-type="content-ref"></th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Getting Started</strong></td>
<td>Install and configure the SDK in 5 minutes</td>
<td><a href="getting-started.md">getting-started.md</a></td>
</tr>
<tr>
<td><strong>API Reference</strong></td>
<td>Complete reference for all hooks and functions</td>
<td><a href="api/README.md">api/README.md</a></td>
</tr>
<tr>
<td><strong>Examples</strong></td>
<td>Working examples for common use cases</td>
<td><a href="guides/README.md">guides/README.md</a></td>
</tr>
</tbody>
</table>
```

The entire card is clickable when using `data-card-target`. Add `data-card-cover` column for images.

### Embeds

Embed external content (CodeSandbox, StackBlitz, GitHub repos):

```markdown
{% embed url="https://stackblitz.com/edit/my-sdk-demo" %}
Interactive SDK demo
{% endembed %}
```

### File Downloads

Attach downloadable files (example configs, schemas):

```markdown
{% file src=".gitbook/assets/openapi.yaml" %}
Download the OpenAPI specification
{% endfile %}
```

## Reusable Content

GitBook supports reusable content blocks that sync across pages (Pro/Enterprise plans).

### In Git Sync repos

Reusable blocks export to `.gitbook/includes/` as separate markdown files:

```markdown
{% include "../../.gitbook/includes/shared-query-params.md" %}
```

Paths are **relative to the referencing file**, not the repo root.

### SDK docs pattern

Create shared parameter/return type blocks:

```
.gitbook/
  includes/
    query-options.md      # Shared read/query parameters
    query-result.md       # Shared query return fields
    mutation-options.md   # Shared mutation parameters
    mutation-result.md    # Shared mutation return fields
```

Then include in each API reference page:

```markdown
## Parameters

### userId

`string`
The user ID to fetch data for.

### options

`RequestOptions | undefined`
Additional request configuration.

{% include "../../.gitbook/includes/query-options.md" %}

## Return Type

{% include "../../.gitbook/includes/query-result.md" %}
```

## OpenAPI / API Reference

GitBook renders OpenAPI specs as interactive API reference pages with try-it panels.

### Adding an OpenAPI block

```markdown
{% openapi src="https://api.example.com/openapi.json" path="/users" method="get" %}
{% endopenapi %}
```

Or reference a local file synced via Git:

```markdown
{% openapi src="./api-spec.yaml" path="/users/{id}" method="get" %}
{% endopenapi %}
```

Supports Swagger 2.0 and OpenAPI 3.0.

### Custom code samples via `x-codeSamples`

Add SDK-specific examples directly in your OpenAPI spec:

```yaml
paths:
  /users:
    get:
      summary: List users
      x-codeSamples:
        - lang: TypeScript
          label: SDK
          source: |
            import { listUsers } from 'my-sdk'

            const users = await listUsers({ limit: 10 })
            console.log(users)
        - lang: bash
          label: cURL
          source: |
            curl -H "Authorization: Bearer sk_..." \
              https://api.example.com/users?limit=10
```

### Useful `x-` extensions

| Extension                         | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `x-codeSamples`                   | Custom code examples per endpoint          |
| `x-page-title` / `x-displayName`  | Override tag display name in nav           |
| `x-page-description`              | Contextual description on doc page         |
| `x-hideTryItPanel`                | Hide the interactive "Test it" button      |
| `x-internal` / `x-gitbook-ignore` | Exclude endpoints from public docs         |
| `x-stability`                     | Mark as `experimental`, `alpha`, or `beta` |
| `x-enumDescriptions`              | Per-value enum descriptions                |

### CORS for URL-based specs

If loading spec from a URL, the API must allow cross-origin GET requests:

```
Access-Control-Allow-Origin: https://your-site.gitbook.io
```

## SDK Documentation Patterns in GitBook

### Mapping our doc types to GitBook features

| Doc type                       | Best GitBook features                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| **Tutorial** (Getting Started) | Stepper blocks, hints (success), embeds for demos                         |
| **How-to Guide** (Task Guide)  | Code blocks with titles, tabs for framework variants, hints (warning)     |
| **API Reference**              | OpenAPI blocks with x-codeSamples, or manual pages with reusable includes |
| **Explanation** (Concept page) | Standard prose, expandable details for deep dives, embed for diagrams     |

### Package manager tabs pattern

````markdown
{% tabs %}
{% tab title="pnpm" %}

```bash
pnpm add my-sdk
```
````

{% endtab %}
{% tab title="npm" %}

```bash
npm install my-sdk
```

{% endtab %}
{% tab title="yarn" %}

```bash
yarn add my-sdk
```

{% endtab %}
{% tab title="bun" %}

```bash
bun add my-sdk
```

{% endtab %}
{% endtabs %}

````

### Parameter documentation pattern

GitBook doesn't have VitePress-style `[!code focus]` annotations. Instead, use **titled code blocks** per parameter with the relevant line visible:

```markdown
### userId

`string | undefined`

User ID to fetch data for. Querying is disabled if `userId` is `undefined`.

{% code title="index.tsx" %}
```typescript
import { useUserData } from 'my-sdk'

function App() {
  const result = useUserData({
    userId: 'usr_abc123',  // <-- this parameter
  })
}
````

{% endcode %}

```

```
