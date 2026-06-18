import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// JSSG replacement for the per-hook ast-grep rules. For the config hooks whose
// config field was renamed in 3.1.0 (`tokenAddress` -> `address`,
// `tokenAddresses` -> `addresses`) and whose redundant `wrapperAddress: tokenAddress`
// was dropped, rewrite the FIRST argument object in place.
//
// The ast-grep patterns (`useX({ tokenAddress: $V })`) only matched the simplest
// single-property, single-argument call — so real call sites silently slipped
// through: an extra property (`{ tokenAddress, account }`), a second options
// argument (`useX({ tokenAddress }, { enabled })`), or shorthand (`{ tokenAddress }`).
// Matching on the AST instead handles all of those.
const HOOKS = new Set([
  "useShield",
  "useConfidentialBalance",
  "useConfidentialBalances",
  "useConfidentialTransfer",
  "useUnderlyingAllowance",
  "useConfidentialIsOperator",
]);

const RENAME: Record<string, string> = {
  tokenAddress: "address",
  tokenAddresses: "addresses",
};

// Pre-filter: only visit files that call one of the affected hooks.
export const getSelector: GetSelector<Tsx> = () => ({
  rule: { kind: "identifier", regex: `^(${[...HOOKS].join("|")})$` },
});

const codemod: Codemod<Tsx> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const fn = call.field("function");
    if (!fn || !HOOKS.has(fn.text())) {
      continue;
    }
    const args = call.field("arguments");
    if (!args) {
      continue;
    }
    // Skip a leading comment node (tree-sitter treats comments as named children).
    const firstArg = args.children().find((c) => c.isNamed() && c.kind() !== "comment");
    if (!firstArg || firstArg.kind() !== "object") {
      continue;
    }

    const members = firstArg.children().filter((c) => c.isNamed());

    // First pass: capture the tokenAddress value so a redundant
    // `wrapperAddress: <same value>` can be dropped.
    let tokenValue: string | null = null;
    for (const m of members) {
      if (m.kind() === "pair" && m.field("key")?.text() === "tokenAddress") {
        tokenValue = m.field("value")?.text() ?? null;
      } else if (m.kind() === "shorthand_property_identifier" && m.text() === "tokenAddress") {
        tokenValue = "tokenAddress";
      }
    }

    let changed = false;
    const rebuilt = [];
    for (const m of members) {
      if (m.kind() === "pair") {
        const key = m.field("key")?.text() ?? "";
        const value = m.field("value")?.text() ?? "";
        const renamedKey = RENAME[key];
        if (renamedKey !== undefined) {
          rebuilt.push(`${renamedKey}: ${value}`);
          changed = true;
        } else if (key === "wrapperAddress" && tokenValue !== null && value === tokenValue) {
          // Drop the redundant wrapper — for ERC-7984 the wrapper IS the token.
          changed = true;
        } else {
          rebuilt.push(m.text());
        }
      } else if (m.kind() === "shorthand_property_identifier" && RENAME[m.text()] !== undefined) {
        rebuilt.push(`${RENAME[m.text()]}: ${m.text()}`);
        changed = true;
      } else {
        rebuilt.push(m.text());
      }
    }

    if (!changed) {
      continue;
    }

    edits.push(firstArg.replace(`{ ${rebuilt.join(", ")} }`));
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default codemod;
