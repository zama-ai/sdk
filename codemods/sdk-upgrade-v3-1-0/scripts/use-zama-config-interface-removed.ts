import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// JSSG port of the jscodeshift transform. UseZamaConfig was removed; three edits,
// all at disjoint ranges so a single commitEdits pass is safe (no rule-ordering
// problem — JSSG is imperative, unlike declarative ast-grep YAML):
//   1. drop the `UseZamaConfig` named-import specifier
//   2. drop `extends UseZamaConfig` from interface heritage
//   3. inline `: UseZamaConfig` annotations to the literal config shape
const NAME = "UseZamaConfig";
const INLINED = "{ tokenAddress: Address; wrapperAddress?: Address }";

// Pre-filter: skip files that never reference the removed type. It appears as an
// import specifier (identifier) and as a type reference (type_identifier).
export const getSelector: GetSelector<Tsx> = () => ({
  rule: {
    any: [
      { kind: "identifier", regex: `^${NAME}$` },
      { kind: "type_identifier", regex: `^${NAME}$` },
    ],
  },
});

const codemod: Codemod<Tsx> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // (1) Rebuild any named-import group that includes UseZamaConfig. When it was the
  // group's only specifier, drop the whole import statement rather than leave a dead
  // `import {} from "..."` (unless a default/namespace import shares the statement).
  for (const imports of rootNode.findAll({ rule: { kind: "named_imports" } })) {
    const specifiers = imports.children().filter((c) => c.kind() === "import_specifier");
    const kept = specifiers.filter((s) => !s.text().includes(NAME));
    if (kept.length === specifiers.length) {
      continue;
    }
    if (kept.length > 0) {
      edits.push(imports.replace(`{ ${kept.map((s) => s.text()).join(", ")} }`));
      continue;
    }
    let stmt = imports.parent();
    while (stmt && stmt.kind() !== "import_statement") {
      stmt = stmt.parent();
    }
    const hasOtherBinding =
      stmt
        ?.children()
        .find((c) => c.kind() === "import_clause")
        ?.children()
        .some((c) => c.isNamed() && c.kind() !== "named_imports") ?? false;
    edits.push(stmt && !hasOtherBinding ? stmt.replace("") : imports.replace("{}"));
  }

  // (2) Drop `UseZamaConfig` from interface heritage. Remove only the reference and
  // keep any sibling bases (`extends UseZamaConfig, Bar` -> `extends Bar`); replace
  // the whole clause only when UseZamaConfig was the sole base.
  for (const clause of rootNode.findAll({ rule: { kind: "extends_type_clause" } })) {
    const bases = clause.children().filter((c) => c.isNamed());
    const kept = bases.filter((b) => b.text() !== NAME);
    if (kept.length === bases.length) {
      continue;
    }
    edits.push(
      clause.replace(kept.length === 0 ? "" : `extends ${kept.map((b) => b.text()).join(", ")}`),
    );
  }

  // (3) Inline `: UseZamaConfig` type annotations (not the heritage reference above).
  for (const annotation of rootNode.findAll({ rule: { kind: "type_annotation" } })) {
    const ref = annotation
      .children()
      .find((c) => c.kind() === "type_identifier" && c.text() === NAME);
    if (!ref) {
      continue;
    }
    edits.push(ref.replace(INLINED));
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default codemod;
