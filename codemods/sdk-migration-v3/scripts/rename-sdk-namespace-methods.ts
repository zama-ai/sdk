import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type Tsx from "codemod:ast-grep/langs/tsx";

// SDK-169 (PR #354): ZamaSDK's flat method surface was carved into `permits` /
// `delegations` / `decryption` namespaces (e.g. `sdk.allow(c)` ->
// `sdk.permits.grantPermit(c)`). The old methods no longer exist on the root SDK
// object, so a real call site fails to typecheck (TS2339) after the bump.
//
// Method names here (allow, isAllowed, userDecrypt, ...) are not distinctive
// enough to rename as bare identifiers the way a `useXxx` hook name is --
// `.allow(...)` or `.isAllowed(...)` on an arbitrary receiver could belong to
// any unrelated class. So this only rewrites `X.method(...)` where X is traced,
// same-file, to a local `new ZamaSDK(...)` binding imported from `@zama-fhe/sdk`
// -- the same import-provenance technique as
// core-rename-createzamaconfig-to-createconfig.ts.
//
// Known limitation (best-effort, not exhaustive): an SDK instance obtained any
// other way -- a factory function, a React hook, destructuring, re-assignment
// through an intermediate variable -- is NOT traced and is left for the
// typecheck + manual fix / AI tail. See README "Known limitations".
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
      "TODO(sdk-249): isDelegated -> isActive is a semantic change, not just a rename " +
      "-- isActive additionally checks expiry (existence alone is no longer enough to " +
      "return true). Verify this call site still holds under the new semantics.",
  },
  getDelegationExpiry: { namespace: "delegations", method: "getExpiry" },
  // The SDK-169 PR (#354) originally landed these three as decryption.userDecrypt /
  // .delegatedDecrypt / .publicDecrypt, but SDK-205 (PR #386, "align decrypt wording
  // with the Zama glossary") renamed them again three commits later. Target the
  // CURRENT names (verified against packages/sdk/src/namespaces/decryption.ts) --
  // decryption.userDecrypt/.delegatedDecrypt/.publicDecrypt do not exist.
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

  // (3) Rewrite `X.method(args)` where X is a traced SDK binding and `method` is
  // in the rename map. The semantic-shift case (isDelegated) replaces the whole
  // call. Every case -- including the semantic-shift one -- only ever replaces
  // the `property` node, never the whole `call` (arguments untouched). This
  // matters beyond tidiness: `call.replace(...)` covers the call's entire range,
  // including its `arguments` subtree, so a DIFFERENT matched call nested in
  // those arguments (e.g. `sdk.isDelegated(sdk.allow([...]))`) would have its
  // own, independently-collected edit silently discarded by commitEdits for
  // overlapping the outer edit's range -- no error, just a dropped rewrite. The
  // `property` node's range ends right before the arguments' opening paren, so
  // appending a trailing comment to its replacement text stays disjoint from
  // whatever edits a nested call inside `arguments` may also contribute.
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
