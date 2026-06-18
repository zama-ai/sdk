#!/usr/bin/env node
/**
 * Validates internal links in the GitBook docs (docs/gitbook/src).
 *
 * GitBook publishes each space under a sub-path (e.g. docs.zama.org/protocol/sdk).
 * Host-absolute links like `](/reference/sdk/RelayerWeb)` resolve against the SITE
 * root there, miss the space, and get rewritten to a broken external GitHub URL →
 * page-not-found. Relative `.md` links resolve natively on GitBook. Such breakage
 * otherwise only surfaces on the live site, so this check is the guard.
 *
 * Fails on:
 *   1. host-absolute internal links            `](/foo)`
 *   2. relative `.md` / asset targets that don't exist
 *   3. `#anchor` fragments with no matching heading in the target page
 *
 * Links are extracted with markdown-it (covers inline, reference-style, autolinks,
 * images, and raw HTML `<a href>`/`<img src>`; links inside fenced/inline code never
 * emit tokens, so they're ignored). External links (http/mailto/tel) are left to
 * lychee. Run: pnpm docs:check-links
 */
import MarkdownIt from "markdown-it";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, basename } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = "docs/gitbook/src";
const INCLUDES = "docs/gitbook/.gitbook/includes";

const md = new MarkdownIt({ html: true });

/** GitBook heading → anchor slug, applied to the heading's *rendered* text (see
 *  headingTexts). GitBook lowercases, KEEPS `[a-z0-9_]` (underscores are preserved —
 *  verified on a live site: `## TOKEN_TOPICS` → `#token_topics`), and collapses every
 *  other run (spaces, `.`, parens, …) into a single hyphen, then trims.
 *  (`decryption.decryptValues` → `decryption-decryptvalues`; `TOKEN_TOPICS` → `token_topics`.) */
export function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HTML_ATTR_RE = /(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Rendered plain text of a markdown-it inline token — concatenates literal text and
 *  inline code, drops emphasis/link markup. This matters for slugging: `_(static)_` is
 *  italic markup (renders to "(static)", underscores gone), whereas an intraword `_`
 *  like in TOKEN_TOPICS is literal and must be kept. */
function inlineText(inline) {
  let out = "";
  for (const child of inline.children ?? []) {
    if (child.type === "text" || child.type === "code_inline") {
      out += child.content;
    } else if (child.type === "softbreak" || child.type === "hardbreak") {
      out += " ";
    }
  }
  return out;
}

/** Rendered heading texts in a markdown string (fence/code-aware via the tokenizer). */
function headingTexts(markdown) {
  const tokens = md.parse(markdown, {});
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "heading_open" && tokens[i + 1]?.type === "inline") {
      out.push(inlineText(tokens[i + 1]));
    }
  }
  return out;
}

const INCLUDE_RE = /\{%\s*include\s+"([^"]+)"\s*%\}/g;

/** Anchor slugs a page exposes — its own headings plus those of any
 *  `{% include %}`-d fragment (resolved by basename within the includes dir,
 *  which is the single home for all includes). */
export function extractHeadingSlugs(markdown) {
  // Heading texts from the page plus any {% include %}-d fragment.
  const texts = [...headingTexts(markdown)];
  for (const m of markdown.matchAll(INCLUDE_RE)) {
    const incFile = join(INCLUDES, basename(m[1]));
    if (existsSync(incFile)) {
      texts.push(...headingTexts(readFileSync(incFile, "utf8")));
    }
  }
  // Disambiguate repeated headings the way GitBook/GitHub do: the 2nd "Example"
  // heading slugs to #example-1, the 3rd to #example-2, etc. Without this, a valid
  // link to #example-1 would be falsely reported as "anchor not found".
  const slugs = new Set();
  const counts = new Map();
  for (const text of texts) {
    const base = slug(text);
    if (!base) {
      continue;
    }
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  }
  return slugs;
}

/** All link/image hrefs in a markdown string, with a best-effort source line. */
export function extractLinks(markdown) {
  const tokens = md.parse(markdown, {});
  const lines = markdown.split("\n");
  const links = [];

  const lineOf = (token, needle) => {
    if (!token?.map) {
      return 0;
    }
    const [start, end] = token.map;
    for (let i = start; i < end && i < lines.length; i++) {
      if (needle && lines[i].includes(needle)) {
        return i + 1;
      }
    }
    return start + 1;
  };

  const fromHtml = (content, token) => {
    for (const m of content.matchAll(HTML_ATTR_RE)) {
      const href = m[1] ?? m[2];
      if (href) {
        links.push({ href, line: lineOf(token, href) });
      }
    }
  };

  for (const tok of tokens) {
    if (tok.type === "html_block") {
      fromHtml(tok.content, tok);
    } else if (tok.type === "inline") {
      for (const child of tok.children ?? []) {
        if (child.type === "link_open") {
          const href = child.attrGet("href");
          if (href) {
            links.push({ href, line: lineOf(tok, href) });
          }
        } else if (child.type === "image") {
          const src = child.attrGet("src");
          if (src) {
            links.push({ href: src, line: lineOf(tok, src) });
          }
        } else if (child.type === "html_inline") {
          fromHtml(child.content, tok);
        }
      }
    }
  }
  return links;
}

const isExternal = (href) => /^(?:https?:|mailto:|tel:)/i.test(href) || href.startsWith("//");

function listMarkdown(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true })
    .filter((f) => typeof f === "string" && f.endsWith(".md"))
    .map((f) => join(dir, f));
}

/** Pages that no `SUMMARY.md` entry links to. GitBook only publishes pages listed
 *  in SUMMARY, so an unreferenced page is invisible (or a stale leftover). Returns
 *  the orphan files (absolute paths); SUMMARY.md itself is never an orphan. */
export function findOrphans(summaryMarkdown, summaryDir, mdFiles) {
  const dir = resolve(summaryDir);
  const linked = new Set();
  for (const { href } of extractLinks(summaryMarkdown)) {
    if (href.startsWith("#") || href.startsWith("/") || isExternal(href)) {
      continue;
    }
    const [path] = href.split("#");
    if (path.endsWith(".md")) {
      linked.add(resolve(dir, path));
    }
  }
  const summaryAbs = resolve(dir, "SUMMARY.md");
  return mdFiles.map((f) => resolve(f)).filter((f) => f !== summaryAbs && !linked.has(f));
}

/** Returns an array of human-readable failure strings (empty = all good). */
export function checkTree() {
  const failures = [];
  const srcFiles = listMarkdown(SRC);
  // Guard against a vacuously-green run: if SRC resolves to nothing (e.g. invoked
  // from the wrong working directory), fail loudly instead of "0 pages, all good".
  if (srcFiles.length === 0) {
    return [`${SRC}/: no markdown pages found — run from the repo root`];
  }
  const slugCache = new Map();
  const getSlugs = (file) => {
    if (!slugCache.has(file)) {
      slugCache.set(file, extractHeadingSlugs(readFileSync(file, "utf8")));
    }
    return slugCache.get(file);
  };

  for (const file of srcFiles) {
    for (const { href, line } of extractLinks(readFileSync(file, "utf8"))) {
      const at = `${file}:${line}`;

      if (href.startsWith("/")) {
        failures.push(`${at}  host-absolute link \`${href}\` — use a relative .md path`);
        continue;
      }
      if (href.startsWith("#")) {
        if (!getSlugs(file).has(href.slice(1))) {
          failures.push(`${at}  anchor \`${href}\` not found in this page`);
        }
        continue;
      }
      if (isExternal(href)) {
        continue;
      }

      const [path, ...anchorParts] = href.split("#");
      if (!path) {
        continue;
      }
      const targetAbs = resolve(dirname(file), path);
      if (!path.endsWith(".md")) {
        if (!existsSync(targetAbs)) {
          failures.push(`${at}  asset target \`${href}\` does not exist`);
        }
        continue;
      }
      if (!existsSync(targetAbs)) {
        failures.push(`${at}  link target \`${href}\` does not exist`);
        continue;
      }
      const anchor = anchorParts.join("#");
      if (anchor && !getSlugs(targetAbs).has(anchor)) {
        failures.push(`${at}  anchor \`#${anchor}\` not found in ${relative(SRC, targetAbs)}`);
      }
    }
  }

  // Transcluded fragments would break the same way — ban host-absolute links there too.
  for (const file of listMarkdown(INCLUDES)) {
    for (const { href, line } of extractLinks(readFileSync(file, "utf8"))) {
      if (href.startsWith("/")) {
        failures.push(`${file}:${line}  host-absolute link \`${href}\` — use a relative .md path`);
      }
    }
  }

  // Orphan pages: every page under docs/gitbook/src (the GitBook-published surface)
  // must be reachable from SUMMARY.md, or GitBook won't publish it. This is an
  // intentional hard-fail — there is no ignore list. Non-published docs (e.g.
  // docs/agents/) live outside src/ and aren't checked; keep deliberately-unpublished
  // drafts out of src/ rather than orphaning them here.
  const summaryPath = join(SRC, "SUMMARY.md");
  if (existsSync(summaryPath)) {
    const orphans = findOrphans(readFileSync(summaryPath, "utf8"), SRC, srcFiles);
    for (const orphan of orphans) {
      failures.push(`${relative(SRC, orphan)}  orphan page — not linked from SUMMARY.md`);
    }
  } else {
    // Don't silently skip the orphan gate — a missing SUMMARY.md is itself a failure.
    failures.push(`${summaryPath}: missing — cannot verify page reachability`);
  }

  return failures;
}

// CLI entry (skipped when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = checkTree();
  if (failures.length) {
    console.error(`✖ ${failures.length} broken internal doc link(s):\n`);
    for (const f of failures) {
      console.error("  " + f);
    }
    console.error(
      "\nInternal links must be relative .md paths (e.g. ../reference/sdk/Token.md), " +
        "never host-absolute (/reference/...). Anchors must match a heading in the target page.",
    );
    process.exit(1);
  }
  const count = listMarkdown(SRC).length;
  console.log(`✓ ${count} pages checked — all internal links and anchors resolve.`);
}
