import type { Codemod } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// JSSG port of the jscodeshift transform. UseZamaConfig was removed; three edits,
// all at disjoint ranges so a single commitEdits pass is safe (no rule-ordering
// problem — JSSG is imperative, unlike declarative ast-grep YAML):
//   1. drop the `UseZamaConfig` named-import specifier
//   2. drop `extends UseZamaConfig` from interface heritage
//   3. inline `: UseZamaConfig` annotations to the literal config shape
const NAME = "UseZamaConfig";
const INLINED = "{ tokenAddress: Address; wrapperAddress?: Address }";

const codemod: Codemod<Tsx> = async (root) => {
  const rootNode = root.root();
  const edits = [];

  // (1) Rebuild any named-import group that includes UseZamaConfig.
  for (const imports of rootNode.findAll({ rule: { kind: "named_imports" } })) {
    const specifiers = imports.children().filter((c) => c.kind() === "import_specifier");
    const kept = specifiers.filter((s) => !s.text().includes(NAME));
    if (kept.length === specifiers.length) {
      continue;
    }
    edits.push({
      startPos: imports.range().start.index,
      endPos: imports.range().end.index,
      insertedText: `{ ${kept.map((s) => s.text()).join(", ")} }`,
    });
  }

  // (2) Remove `extends UseZamaConfig` heritage clauses.
  for (const clause of rootNode.findAll({ rule: { kind: "extends_type_clause" } })) {
    if (!clause.text().includes(NAME)) {
      continue;
    }
    edits.push({
      startPos: clause.range().start.index,
      endPos: clause.range().end.index,
      insertedText: "",
    });
  }

  // (3) Inline `: UseZamaConfig` type annotations (not the heritage reference above).
  for (const annotation of rootNode.findAll({ rule: { kind: "type_annotation" } })) {
    const ref = annotation
      .children()
      .find((c) => c.kind() === "type_identifier" && c.text() === NAME);
    if (!ref) {
      continue;
    }
    edits.push({
      startPos: ref.range().start.index,
      endPos: ref.range().end.index,
      insertedText: INLINED,
    });
  }

  if (edits.length === 0) {
    return null;
  }
  return rootNode.commitEdits(edits);
};

export default codemod;
