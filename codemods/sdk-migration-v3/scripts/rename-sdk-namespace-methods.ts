import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// ZamaSDK's flat credential methods were carved into `permits` / `delegations` /
// `decryption` namespaces (e.g. `sdk.allow(c)` -> `sdk.permits.grantPermit(c)`);
// the old methods no longer exist on the root SDK object.
//
// Method names here aren't distinctive enough to rename as bare identifiers the
// way a `useXxx` hook is -- `.allow(...)` could belong to any class. So this only
// rewrites `X.method(...)` where X traces, same-file, to a local `new ZamaSDK(...)`
// binding imported from `@zama-fhe/sdk` (same technique as
// core-rename-createzamaconfig-to-createconfig.ts).
//
// Best-effort: an SDK instance obtained another way (factory, hook, re-assigned
// variable) isn't traced and is left for typecheck + manual fix. See README.
const SDK_IMPORT_NAME = "ZamaSDK";

interface RenameTarget {
  namespace: string;
  method: string;
  /** Set only for a call whose behavior, not just its name, changed. */
  semanticShiftNote?: string;
}

const RENAME_MAP: Record<string, RenameTarget> = {
  allow: { namespace: "permits", method: "grantPermit" },
  allowAs: { namespace: "permits", method: "grantDelegationPermit" },
  isAllowed: { namespace: "permits", method: "hasPermit" },
  isAllowedAs: { namespace: "permits", method: "hasDelegationPermit" },
  revokePermits: { namespace: "permits", method: "revokePermits" },
  clearCredentials: { namespace: "permits", method: "clear" },
  delegateDecryption: { namespace: "delegations", method: "delegateDecryption" },
  revokeDelegation: { namespace: "delegations", method: "revokeDelegation" },
  isDelegated: {
    namespace: "delegations",
    method: "isActive",
    semanticShiftNote:
      "TODO: isDelegated -> isActive is a semantic change, not just a rename -- " +
      "isActive additionally checks expiry (existence alone is no longer enough to " +
      "return true). Verify this call site still holds under the new semantics.",
  },
  getDelegationExpiry: { namespace: "delegations", method: "getExpiry" },
  // Verified against packages/sdk/src/namespaces/decryption.ts -- an earlier
  // internal name for these three no longer exists.
  userDecrypt: { namespace: "decryption", method: "decryptValues" },
  delegatedUserDecrypt: { namespace: "decryption", method: "delegatedDecryptValues" },
  publicDecrypt: { namespace: "decryption", method: "decryptPublicValues" },
};

// Pre-filter: skip files that never import ZamaSDK.
export const getSelector: GetSelector<Tsx> = () => ({
  rule: { kind: "identifier", regex: `^${SDK_IMPORT_NAME}$` },
});

const codemod: Codemod<Tsx> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // (1) Only trace `new ZamaSDK(...)` where ZamaSDK is imported from @zama-fhe/sdk
  // (an aliased import is followed: `import { ZamaSDK as Client } from "@zama-fhe/sdk"`).
  let sdkImportLocalName: string | null = null;
  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = imp.field("source")?.text() ?? "";
    if (!source.includes("@zama-fhe/sdk")) {
      continue;
    }
    for (const spec of imp.findAll({ rule: { kind: "import_specifier" } })) {
      const name = spec.field("name");
      if (name?.text() === SDK_IMPORT_NAME) {
        sdkImportLocalName = (spec.field("alias") ?? name).text();
      }
    }
  }
  if (!sdkImportLocalName) {
    return null;
  }

  // (2) Trace local bindings assigned `new <sdkImportLocalName>(...)`: a plain
  // `const sdk = new ZamaSDK(cfg)` / `sdk = new ZamaSDK(cfg)`, or a member
  // assignment `this.sdk = new ZamaSDK(cfg)` (tracked as the whole "this.sdk" text).
  const sdkVarNames = new Set<string>();
  for (const newExpr of rootNode.findAll({ rule: { kind: "new_expression" } })) {
    const ctor = newExpr.field("constructor");
    if (ctor?.text() !== sdkImportLocalName) {
      continue;
    }

    const parent = newExpr.parent();
    if (parent?.kind() === "variable_declarator") {
      const nameNode = parent.field("name");
      if (nameNode?.kind() === "identifier") {
        sdkVarNames.add(nameNode.text());
      }
    } else if (parent?.kind() === "assignment_expression") {
      const left = parent.field("left");
      if (left && (left.kind() === "identifier" || left.kind() === "member_expression")) {
        sdkVarNames.add(left.text());
      }
    }
  }
  if (sdkVarNames.size === 0) {
    return null;
  }

  // (3) Rewrite `X.method(args)`. Every case -- including the semantic-shift one --
  // only replaces the `property` node, never the whole `call`: replacing the call
  // would cover `arguments` too, silently dropping any edit from a different
  // matched call nested inside (e.g. `sdk.isDelegated(sdk.allow([...]))`), since
  // commitEdits discards overlapping edits with no error.
  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const fn = call.field("function");
    if (!fn || fn.kind() !== "member_expression") {
      continue;
    }
    const object = fn.field("object");
    const property = fn.field("property");
    if (!object || !property || !sdkVarNames.has(object.text())) {
      continue;
    }
    const target = RENAME_MAP[property.text()];
    if (!target) {
      continue;
    }
    const replacement = `${target.namespace}.${target.method}`;
    edits.push(
      property.replace(
        target.semanticShiftNote ? `${replacement} /* ${target.semanticShiftNote} */` : replacement,
      ),
    );
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
};

export default codemod;
