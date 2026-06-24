import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// JSSG port of the jscodeshift transform: for the hooks whose first argument
// changed from `{ tokenAddress, wrapperAddress? }` to a positional `address`,
// replace the object-literal first argument with its `tokenAddress` value.
const HOOKS = new Set([
  "useApproveUnderlying",
  "useConfidentialSetOperator",
  "useConfidentialTransferFrom",
  "useDecryptBalanceAs",
  "useDelegateDecryption",
  "useFinalizeUnwrap",
  "useResumeUnshield",
  "useRevokeDelegation",
  "useToken",
  "useUnshield",
  "useUnshieldAll",
  "useUnwrap",
  "useUnwrapAll",
]);

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

    let valueText: string | null = null;
    for (const member of firstArg.children()) {
      if (member.kind() === "pair") {
        const key = member.field("key");
        if (key && key.text() === "tokenAddress") {
          valueText = member.field("value")?.text() ?? null;
          break;
        }
      } else if (
        member.kind() === "shorthand_property_identifier" &&
        member.text() === "tokenAddress"
      ) {
        valueText = "tokenAddress";
        break;
      }
    }
    if (valueText === null) {
      continue;
    }

    edits.push(firstArg.replace(valueText));
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default codemod;
