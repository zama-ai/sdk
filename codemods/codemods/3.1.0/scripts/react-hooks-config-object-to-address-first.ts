import type { Codemod } from "codemod:ast-grep";
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

const codemod: Codemod<Tsx> = async (root) => {
  const rootNode = root.root();
  const edits = [];

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const fn = call.field("function");
    if (!fn || !HOOKS.has(fn.text())) {
      continue;
    }

    const args = call.field("arguments");
    if (!args) {
      continue;
    }
    const firstArg = args.children().find((c) => c.isNamed());
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

    edits.push({
      startPos: firstArg.range().start.index,
      endPos: firstArg.range().end.index,
      insertedText: valueText,
    });
  }

  if (edits.length === 0) {
    return null;
  }
  return rootNode.commitEdits(edits);
};

export default codemod;
