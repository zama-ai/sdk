import { describe, expect, test } from "vitest";
import { slug, extractLinks, extractHeadingSlugs, findOrphans } from "../check-links.mjs";

const hrefs = (markdown) =>
  extractLinks(markdown)
    .map((l) => l.href)
    .sort((a, b) => a.localeCompare(b));

describe("slug (GitBook heading → anchor)", () => {
  test("lowercases and hyphenates words", () => {
    expect(slug("Gating useConfidentialBalance")).toBe("gating-useconfidentialbalance");
  });

  test("dotted method names → period becomes a hyphen", () => {
    // GitBook differs from GitHub here: `.` is a separator, not dropped.
    expect(slug("decryption.decryptValues")).toBe("decryption-decryptvalues");
    expect(slug("permits.revokePermits")).toBe("permits-revokepermits");
  });

  test("underscores are preserved (GitBook keeps them, unlike spaces/periods)", () => {
    // Verified on a live GitBook site: `## TOKEN_TOPICS` → `#token_topics`.
    expect(slug("TOKEN_TOPICS")).toBe("token_topics");
    expect(slug("ACL_TOPICS")).toBe("acl_topics");
  });

  test("punctuation runs collapse to a single hyphen; trims", () => {
    expect(slug("3. Decryption of the encrypted data")).toBe("3-decryption-of-the-encrypted-data");
    expect(slug("useShield")).toBe("useshield");
  });
});

describe("extractLinks", () => {
  test("inline links", () => {
    expect(hrefs("See [Token](../reference/sdk/Token.md).")).toEqual(["../reference/sdk/Token.md"]);
  });

  test("reference-style links", () => {
    const md = "Use [config][c] here.\n\n[c]: ./configuration.md\n";
    expect(hrefs(md)).toEqual(["./configuration.md"]);
  });

  test("HTML <a href> (double and single quotes) and <img src>", () => {
    const md = [
      `<a href="../reference/sdk/Token.md">x</a>`,
      `<a href='/host-absolute'>y</a>`,
      `<img src="../images/foo.svg" alt="">`,
    ].join("\n\n");
    expect(hrefs(md)).toEqual(["../images/foo.svg", "../reference/sdk/Token.md", "/host-absolute"]);
  });

  test("ignores links inside fenced code blocks", () => {
    const md = "```ts\nconst u = '[x](/nope)';\n```\n";
    expect(hrefs(md)).toEqual([]);
  });

  test("ignores links inside inline code spans", () => {
    expect(hrefs("Literal `[y](/nope)` stays code.")).toEqual([]);
  });

  test("captures host-absolute links so the gate can flag them", () => {
    expect(hrefs("[bad](/reference/sdk/Token)")).toEqual(["/reference/sdk/Token"]);
  });
});

describe("extractHeadingSlugs", () => {
  test("collects slugs for every heading level", () => {
    const md = "# Title\n\n## permits.grantPermit\n\n#### Gating useConfidentialBalance\n";
    const slugs = extractHeadingSlugs(md);
    expect(slugs.has("title")).toBe(true);
    expect(slugs.has("permits-grantpermit")).toBe(true);
    expect(slugs.has("gating-useconfidentialbalance")).toBe(true);
  });

  test("does not treat fenced '#' lines as headings", () => {
    const md = "# Real\n\n```sh\n# just a shell comment\n```\n";
    const slugs = extractHeadingSlugs(md);
    expect(slugs.has("real")).toBe(true);
    expect(slugs.has("just-a-shell-comment")).toBe(false);
  });

  test("literal underscore heading keeps the underscore", () => {
    expect(extractHeadingSlugs("## TOKEN_TOPICS\n").has("token_topics")).toBe(true);
  });

  test("emphasis markup is rendered away before slugging (italic _(static)_ → static)", () => {
    // `_(static)_` is italic markup, not a literal underscore, so it must not survive.
    const slugs = extractHeadingSlugs("### Token.batchDecryptBalancesAs _(static)_\n");
    expect(slugs.has("token-batchdecryptbalancesas-static")).toBe(true);
    expect(slugs.has("token-batchdecryptbalancesas-_-static-_")).toBe(false);
  });

  test("disambiguates repeated headings GitBook-style (#example, #example-1, …)", () => {
    const slugs = extractHeadingSlugs("## Example\n\n## Example\n\n## Example\n");
    expect(slugs.has("example")).toBe(true);
    expect(slugs.has("example-1")).toBe(true);
    expect(slugs.has("example-2")).toBe(true);
  });
});

describe("findOrphans", () => {
  const dir = "/docs/src";
  const summary =
    "# Table of contents\n\n- [Overview](overview.md)\n\n## Guides\n\n- [Config](guides/config.md)\n";

  test("flags a page not linked from SUMMARY", () => {
    const files = [
      "/docs/src/overview.md",
      "/docs/src/guides/config.md",
      "/docs/src/guides/orphan.md",
    ];
    expect(findOrphans(summary, dir, files)).toEqual(["/docs/src/guides/orphan.md"]);
  });

  test("SUMMARY.md itself is never an orphan, and linked pages pass", () => {
    const files = ["/docs/src/SUMMARY.md", "/docs/src/overview.md", "/docs/src/guides/config.md"];
    expect(findOrphans(summary, dir, files)).toEqual([]);
  });

  test("a SUMMARY link with an #anchor still marks the page reachable", () => {
    const s = "- [Config](guides/config.md#setup)\n";
    expect(findOrphans(s, dir, ["/docs/src/guides/config.md"])).toEqual([]);
  });

  test("external / host-absolute / anchor-only SUMMARY entries don't mark local files reachable", () => {
    const s = [
      "- [External](https://example.com/page.md)",
      "- [Absolute](/guides/config.md)",
      "- [Same page](#section)",
    ].join("\n");
    // config.md is only referenced by an external + a host-absolute entry → still an orphan.
    expect(findOrphans(s, dir, ["/docs/src/guides/config.md"])).toEqual([
      "/docs/src/guides/config.md",
    ]);
  });

  test("resolves nested relative paths correctly", () => {
    const s = "- [Deep](a/b/c.md)\n";
    const files = ["/docs/src/a/b/c.md", "/docs/src/a/b/d.md"];
    expect(findOrphans(s, dir, files)).toEqual(["/docs/src/a/b/d.md"]);
  });
});
