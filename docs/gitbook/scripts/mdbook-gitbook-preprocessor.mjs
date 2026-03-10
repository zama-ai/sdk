#!/usr/bin/env node

/**
 * mdbook preprocessor that converts GitBook template syntax to HTML.
 *
 * Handles: {% tabs %}, {% hint %}, {% include %}
 *
 * Protocol: https://rust-lang.github.io/mdBook/for_developers/preprocessors.html
 * - Called with "supports <renderer>" → exit 0
 * - Called without args → read JSON from stdin, transform chapters, write JSON to stdout
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// Handle "supports" check
if (process.argv[2] === "supports") {
  process.exit(0);
}

// Read context + book JSON from stdin
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  input += chunk;
}

const [context, book] = JSON.parse(input);
const bookRoot = context.root;

function expandIncludes(content) {
  return content.replace(/\{%\s*include\s*"([^"]+)"\s*%\}/g, (_match, includePath) => {
    const absPath = join(bookRoot, includePath);
    if (existsSync(absPath)) {
      let included = readFileSync(absPath, "utf8");
      return expandIncludes(included);
    }
    return `<!-- include not found: ${includePath} -->`;
  });
}

function convertHints(content) {
  return content.replace(
    /\{%\s*hint\s+style="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/g,
    (_match, style, body) => {
      return `<div class="hint hint-${style}">\n\n${body.trim()}\n\n</div>`;
    },
  );
}

let tabGroupCounter = 0;

function convertTabs(content) {
  return content.replace(/\{%\s*tabs\s*%\}([\s\S]*?)\{%\s*endtabs\s*%\}/g, (_match, inner) => {
    tabGroupCounter++;
    const gid = `tg${tabGroupCounter}`;
    const tabRegex = /\{%\s*tab\s+title="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endtab\s*%\}/g;
    const tabs = [];
    let m;
    while ((m = tabRegex.exec(inner)) !== null) {
      tabs.push({ title: m[1], content: m[2].trim() });
    }
    if (tabs.length === 0) return inner;

    let html = `<div class="tab-group" id="${gid}">\n<div class="tab-headers">\n`;
    tabs.forEach((t, i) => {
      html += `<button class="tab-header${i === 0 ? " active" : ""}" onclick="document.querySelectorAll('#${gid} .tab-content').forEach(c=>c.classList.remove('active'));document.querySelectorAll('#${gid} .tab-header').forEach(h=>h.classList.remove('active'));document.getElementById('${gid}-${i}').classList.add('active');this.classList.add('active')">${t.title}</button>\n`;
    });
    html += `</div>\n`;
    tabs.forEach((t, i) => {
      html += `<div class="tab-content${i === 0 ? " active" : ""}" id="${gid}-${i}">\n\n${t.content}\n\n</div>\n`;
    });
    html += `</div>\n`;
    return html;
  });
}

/** Strip YAML frontmatter (--- ... ---) that mdbook doesn't understand. */
function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n/, "");
}

/** Convert absolute links (/guides/foo) to relative (../guides/foo.md). */
function fixLinks(content) {
  // Match markdown links with absolute paths: [text](/path/to/page)
  return content.replace(/\]\(\/([^)]+)\)/g, (_match, path) => {
    // Don't touch external URLs or anchors
    if (path.startsWith("http") || path.startsWith("#")) return _match;
    // Add .md extension if not present and not an anchor
    const hasExt = /\.\w+$/.test(path.split("#")[0]);
    const fixed = hasExt ? path : path + ".md";
    return `](/${fixed})`;
  });
}

/** Remap unsupported highlight.js languages to supported ones.
 *  mdbook's bundled highlight.js 10.1.1 doesn't support tsx/jsx.
 *  We remap them to typescript/javascript so they get proper highlighting. */
function fixLanguages(content) {
  return content.replace(/```tsx/g, "```typescript").replace(/```jsx/g, "```javascript");
}

function processContent(content) {
  content = stripFrontmatter(content);
  content = expandIncludes(content);
  content = convertHints(content);
  content = convertTabs(content);
  content = fixLinks(content);
  content = fixLanguages(content);
  return content;
}

function walkChapters(chapters) {
  for (const item of chapters) {
    if (item.Chapter) {
      item.Chapter.content = processContent(item.Chapter.content);
      if (item.Chapter.sub_items) {
        walkChapters(item.Chapter.sub_items);
      }
    }
  }
}

walkChapters(book.items ?? book.sections);

process.stdout.write(JSON.stringify(book));
