import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// Import-aware rename of the OLD `createZamaConfig` export to `createConfig`.
//
// The previous bare-pattern ast-grep rule (`pattern: createZamaConfig`) renamed
// every identifier spelled `createZamaConfig`, which corrupted files that locally
// alias the *new* export to that name, e.g.
//   import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
// Renaming the alias produced the self-collision `createConfig as createConfig`
// (and clashed with wagmi's own `createConfig` import in the same module).
//
// Here we rewrite only when the imported (exported) name is actually
// `createZamaConfig` from a `@zama-fhe` module, and only then rename the local
// binding's references. A `createConfig as createZamaConfig` alias is left alone.
const OLD = "createZamaConfig";
const NEW = "createConfig";

// Pre-filter: skip files that never mention the old name. The transform still
// checks the identifier comes from a `@zama-fhe` import before rewriting.
export const getSelector: GetSelector<Tsx> = () => ({
  rule: { kind: "identifier", regex: `^${OLD}$` },
});

const codemod: Codemod<Tsx> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  let renameUsages = false;

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = imp.field("source")?.text() ?? "";
    if (!source.includes("@zama-fhe")) {
      continue;
    }

    for (const spec of imp.findAll({ rule: { kind: "import_specifier" } })) {
      const name = spec.field("name");
      // Only the imported (exported) name matters; skip `createConfig as createZamaConfig`.
      if (!name || name.text() !== OLD) {
        continue;
      }
      edits.push(name.replace(NEW));
      // No alias => the local binding is `createZamaConfig`; rename its references.
      if (!spec.field("alias")) {
        renameUsages = true;
      }
    }
  }

  if (renameUsages) {
    // Skip identifiers inside import statements — the import name token is already edited.
    const importRanges = rootNode
      .findAll({ rule: { kind: "import_statement" } })
      .map((n) => [n.range().start.index, n.range().end.index] as const);

    for (const id of rootNode.findAll({ rule: { kind: "identifier" } })) {
      if (id.text() !== OLD) {
        continue;
      }
      const start = id.range().start.index;
      if (importRanges.some(([a, b]) => start >= a && start < b)) {
        continue;
      }
      edits.push(id.replace(NEW));
    }
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default codemod;
