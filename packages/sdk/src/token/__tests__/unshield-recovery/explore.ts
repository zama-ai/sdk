// Breadth-first search over every interleaving of SDK calls and chain steps,
// run against the real WrappedToken.
//
// A global state is where each SDK call is (the answers it has had so far)
// plus the shared world. A step answers one pending call of one actor (it
// returns, it throws, or the tab closes), starts the page load, or mines the
// next transaction. Every state reached is checked against the rules, and
// every rule break is classified (see CLASSES). The first example of each
// class is a shortest one.
import type { Hex } from "viem";
import {
  HarnessError,
  POINTER_KEY,
  runSdkCall,
  type Answer,
  type Entry,
  type Outcome,
  type RunResult,
  type Step,
} from "./sdk-call";
import {
  callLabel,
  chainSteps,
  EMPTY_WORLD,
  options,
  parsePointer,
  pretty,
  requestOfTx,
  requestStatus,
  unwrapTx,
  type Option,
  type World,
} from "./world";

export const RULES = [
  "PendingUnshieldIsDiscoverable",
  "PointerKeptAfterSave",
  "NoFalseAlreadyFinalized",
] as const;
export type Rule = (typeof RULES)[number];

interface Violation {
  rule: Rule;
  requestId: Hex;
}

const endedOn = (world: World, requestId: Hex) =>
  world.unsaved.find((u) => u.requestId === requestId)?.endedOn;

/**
 * Every rule break must fall in one of these classes, or the run reports it
 * as unexplained. A finding is a known bug; a bound is outside what the SDK
 * can promise.
 */
export const CLASSES = {
  /** The unshield ended while waiting for its unwrap receipt, before it saved a pointer. */
  "unsaved window": {
    kind: "finding",
    matches: (v: Violation, world: World) =>
      v.rule === "PendingUnshieldIsDiscoverable" &&
      endedOn(world, v.requestId) === "provider.waitForTransactionReceipt",
  },
  /** A call working on another request overwrote or deleted this request's pointer. */
  "one pointer per wrapper": {
    kind: "finding",
    matches: (v: Violation, world: World) => world.clobbered.includes(v.requestId),
  },
  /** Storage refused the pointer write itself. */
  "storage refused the save": {
    kind: "bound",
    matches: (v: Violation, world: World) =>
      v.rule === "PendingUnshieldIsDiscoverable" && endedOn(world, v.requestId) === "pointer save",
  },
} as const;
export type ClassName = keyof typeof CLASSES;

export interface ActorSpec {
  name: string;
  /** Actor k sends Uk and Fk; Uk opens request reqk. */
  slot: number;
  /** An unshield call starts at once. The page load starts at any step, with any entry it could have. */
  entry: Entry | "page load";
}

export interface Scenario {
  name: string;
  actors: ActorSpec[];
}

export interface Exploration {
  states: number;
  transitions: number;
  /** Real SDK calls run to build the actor trees. */
  sdkRuns: number;
  /** A shortest path into each class of rule break that occurred. */
  classified: Map<ClassName, string[]>;
  /** For each rule broken outside every class, a shortest path that breaks it. */
  unexplained: Map<Rule, string[]>;
}

/** One SDK call after a given answer sequence: what the real code did next. */
interface Node {
  slot: number;
  entry: Entry;
  script: Step[];
  run: RunResult;
  /** The unwrap tx this SDK call works on, once it knows one. */
  hash?: Hex;
  /** The last pending-unshield value this SDK call read. */
  pointerRead?: string | null;
  /** An unshield call: it has called `storage.set` on the pointer. */
  saveAttempted: boolean;
  /** An unshield call: that `storage.set` returned. */
  saved: boolean;
  children: Map<string, Node>;
  /** Every answer to the pending call, with the node it leads to (none for a close). */
  steps: { option: Option; child?: Node }[];
  /** Equal for nodes with equal subtrees. */
  canon: number;
}

type ActorState = Node | "idle" | "done";

interface State {
  actors: ActorState[];
  world: World;
}

interface Transition {
  text: () => string;
  state: State;
  falselyFinalized: boolean;
}

const answerKey = (answer: Answer): string => JSON.stringify(answer);
const isUnshield = (entry: Entry) => entry.kind === "unshield" || entry.kind === "unshieldAll";

function deriveNode(slot: number, entry: Entry, script: Step[], run: RunResult, from?: Node): Node {
  const node: Node = {
    slot,
    entry,
    script,
    run,
    hash: from ? from.hash : entry.kind === "resumeUnshield" ? entry.hash : undefined,
    pointerRead: from?.pointerRead,
    saveAttempted: from?.saveAttempted ?? false,
    saved: from?.saved ?? false,
    children: new Map(),
    steps: [],
    canon: -1,
  };
  const last = script.at(-1);
  if (!last) {
    return node;
  }
  const { call, answer } = last;
  if (call.kind === "storage.set" && isUnshield(entry)) {
    node.saveAttempted = true;
    node.saved ||= answer.kind === "ok";
  }
  if (answer.kind !== "ok") {
    return node;
  }
  if (call.kind === "signer.writeContract" && call.functionName === "unwrap") {
    node.hash = answer.value as Hex;
  } else if (call.kind === "storage.get") {
    node.pointerRead = answer.value as string | null;
    if (typeof answer.value === "string") {
      node.hash = parsePointer(answer.value).unwrapTxHash;
    }
  }
  return node;
}

/** Every actor's tree of possible answer sequences, built by running the real code. */
class ActorTrees {
  readonly #roots = new Map<string, Node>();
  /** Every value a `storage.get` can return: null and each value any actor stores. */
  readonly stored: (string | null)[] = [null];
  sdkRuns = 0;

  constructor(readonly scenario: Scenario) {}

  entries(spec: ActorSpec): Entry[] {
    if (spec.entry !== "page load") {
      return [spec.entry];
    }
    const kept = this.scenario.actors
      .filter((a) => a.entry !== "page load")
      .map((a): Entry => ({ kind: "resumeUnshield", hash: unwrapTx(a.slot) }));
    return [{ kind: "getPendingUnshield" }, ...kept];
  }

  root(slot: number, entry: Entry): Node {
    const node = this.#roots.get(`${slot}|${JSON.stringify(entry)}`);
    if (!node) {
      throw new HarnessError(`no tree for actor ${slot} ${JSON.stringify(entry)}`);
    }
    return node;
  }

  async build(): Promise<void> {
    // Grow the trees until no actor can store a value that some storage.get does not yet return.
    for (;;) {
      const found = new Set<string>();
      for (const spec of this.scenario.actors) {
        for (const entry of this.entries(spec)) {
          const key = `${spec.slot}|${JSON.stringify(entry)}`;
          let root = this.#roots.get(key);
          if (!root) {
            root = deriveNode(spec.slot, entry, [], await this.#run(entry, []));
            this.#roots.set(key, root);
          }
          await this.#grow(root, found);
        }
      }
      const fresh = [...found].filter((v) => !this.stored.includes(v)).sort();
      if (fresh.length === 0) {
        break;
      }
      this.stored.push(...fresh);
    }
    const canons = new Map<string, number>();
    for (const root of this.#roots.values()) {
      this.#finish(root, canons);
    }
  }

  async #run(entry: Entry, script: Step[]): Promise<RunResult> {
    this.sdkRuns++;
    return runSdkCall(entry, script);
  }

  async #grow(node: Node, found: Set<string>): Promise<void> {
    if (node.run.next.kind !== "call") {
      return;
    }
    const { call } = node.run.next;
    if (call.kind === "storage.set") {
      found.add(call.value);
    }
    for (const option of options(call, node.slot, this.stored)) {
      if (option.answer.kind === "close") {
        continue;
      }
      const key = answerKey(option.answer);
      let child = node.children.get(key);
      if (!child) {
        const script = [...node.script, { call, answer: option.answer }];
        child = deriveNode(
          node.slot,
          node.entry,
          script,
          await this.#run(node.entry, script),
          node,
        );
        node.children.set(key, child);
      }
      await this.#grow(child, found);
    }
  }

  // Nodes with equal subtrees share one canon id, so different answers that
  // lead the code down the same path count as one state.
  #finish(node: Node, canons: Map<string, number>): number {
    if (node.canon >= 0) {
      return node.canon;
    }
    if (node.run.next.kind === "call") {
      const { call } = node.run.next;
      node.steps = options(call, node.slot, this.stored).map((option) => ({
        option,
        child:
          option.answer.kind === "close" ? undefined : node.children.get(answerKey(option.answer)),
      }));
    }
    const children = [...node.children]
      .map(([key, child]) => `${key}>${this.#finish(child, canons)}`)
      .sort();
    const signature = JSON.stringify([
      node.slot,
      node.entry,
      node.run,
      node.hash ?? null,
      node.pointerRead === undefined ? "unread" : node.pointerRead,
      node.saveAttempted,
      node.saved,
      children,
    ]);
    let canon = canons.get(signature);
    if (canon === undefined) {
      canon = canons.size;
      canons.set(signature, canon);
    }
    node.canon = canon;
    return canon;
  }
}

function outcomeLabel(outcome: Outcome): string {
  if (outcome.kind === "returned") {
    return pretty(`returns ${outcome.value}`);
  }
  // A plain Error comes straight from a fake: show its message, so a harness slip is visible.
  return outcome.name === "Error" || outcome.name === "TypeError"
    ? `throws ${outcome.name} (${outcome.message})`
    : `throws ${outcome.name}`;
}

function endText(name: string, node: Node): string {
  const notes = node.run.notes.map((n) => `; ${pretty(n)}`).join("");
  const end =
    node.run.next.kind === "done" ? `; ${name} ends: ${outcomeLabel(node.run.next.outcome)}` : "";
  return notes + end;
}

/** NoFalseAlreadyFinalized, checked on the step where an SDK call ends. */
function reportsFalseFinalized(node: Node, world: World): boolean {
  if (node.run.next.kind !== "done") {
    return false;
  }
  const { outcome } = node.run.next;
  let reported: Hex | undefined;
  if (outcome.kind === "threw") {
    reported = outcome.unwrapRequestId;
  } else if (
    outcome.value === "null" &&
    node.entry.kind === "getPendingUnshield" &&
    typeof node.pointerRead === "string"
  ) {
    // getPendingUnshield read a pointer and returned null: it cleared the pointer as finalized.
    reported = parsePointer(node.pointerRead).unwrapRequestId;
  }
  return reported !== undefined && requestStatus(world, reported) !== "finalized";
}

/** PendingUnshieldIsDiscoverable and PointerKeptAfterSave, checked on every state. */
function violations(state: State): Violation[] {
  const { world } = state;
  const stored = world.pointer === undefined ? undefined : parsePointer(world.pointer);
  if (stored && requestOfTx(world, stored.unwrapTxHash) !== stored.unwrapRequestId) {
    throw new HarnessError("the stored pointer names a request that its unwrap tx did not open");
  }
  const out: Violation[] = world.saved
    .filter((r) => requestStatus(world, r) === "open" && stored?.unwrapRequestId !== r)
    .map((requestId) => ({ rule: "PointerKeptAfterSave", requestId }));
  if (stored && requestStatus(world, stored.unwrapRequestId) === "open") {
    return out;
  }
  const working = new Set(
    state.actors.map((a) => (typeof a === "object" ? requestOfTx(world, a.hash) : undefined)),
  );
  for (const tx of world.txs) {
    if (
      tx.kind === "unwrap" &&
      !working.has(tx.requestId) &&
      requestStatus(world, tx.requestId) === "open"
    ) {
      out.push({ rule: "PendingUnshieldIsDiscoverable", requestId: tx.requestId });
    }
  }
  return out;
}

function settle(node: Node): ActorState {
  return node.run.next.kind === "done" ? "done" : node;
}

function withActor(state: State, index: number, actor: ActorState, world: World): State {
  const actors = [...state.actors];
  actors[index] = actor;
  return { actors, world };
}

/**
 * `next` plus what the checks need about `actor`'s step from `world`: a
 * pointer it lost for another request, and how an unshield ended unsaved.
 * `child` is absent when the tab closed.
 */
function recordStep(world: World, next: World, actor: Node, child?: Node): World {
  let out = next;
  const own = requestOfTx(world, actor.hash);
  const before = world.pointer === undefined ? undefined : parsePointer(world.pointer);
  if (before && before.unwrapRequestId !== own && next.pointer !== world.pointer) {
    out = { ...out, clobbered: [...new Set([...out.clobbered, before.unwrapRequestId])].sort() };
  }
  const ended = !child || child.run.next.kind === "done";
  if (ended && isUnshield(actor.entry) && own && !(child ?? actor).saved) {
    const pending = actor.run.next.kind === "call" ? actor.run.next.call : undefined;
    const attempted = actor.saveAttempted || pending?.kind === "storage.set";
    const on = attempted ? "pointer save" : pending?.kind;
    if (!on) {
      throw new HarnessError("an actor ended without a pending call");
    }
    out = { ...out, unsaved: [...out.unsaved, { requestId: own, endedOn: on }] };
  }
  return out;
}

function successors(trees: ActorTrees, state: State): Transition[] {
  const out: Transition[] = [];
  const { world } = state;
  for (const [index, spec] of trees.scenario.actors.entries()) {
    const actor = state.actors[index];
    if (actor === "idle") {
      for (const entry of trees.entries(spec)) {
        if (entry.kind === "resumeUnshield" && !world.txs.some((tx) => tx.hash === entry.hash)) {
          continue;
        }
        const node = trees.root(spec.slot, entry);
        const call =
          entry.kind === "resumeUnshield"
            ? `resumeUnshield(${entry.hash}) with a hash the app kept`
            : "getPendingUnshield()";
        out.push({
          text: () => pretty(`${spec.name}: ${call}`) + endText(spec.name, node),
          state: withActor(state, index, settle(node), world),
          falselyFinalized: reportsFalseFinalized(node, world),
        });
      }
      continue;
    }
    if (actor === undefined || actor === "done" || actor.run.next.kind !== "call") {
      continue;
    }
    const { call } = actor.run.next;
    for (const { option, child } of actor.steps) {
      if (option.when && !option.when(world)) {
        continue;
      }
      if (!child) {
        out.push({
          text: () => `${spec.name}: tab closes while waiting on ${callLabel(call)}`,
          state: withActor(state, index, "done", recordStep(world, world, actor)),
          falselyFinalized: false,
        });
        continue;
      }
      const next = recordStep(world, option.apply ? option.apply(world) : world, actor, child);
      out.push({
        text: () => `${spec.name}: ${callLabel(call)} ${option.text}${endText(spec.name, child)}`,
        state: withActor(state, index, settle(child), next),
        falselyFinalized: reportsFalseFinalized(child, next),
      });
    }
  }
  for (const step of chainSteps(world)) {
    out.push({
      text: () => step.text,
      state: { actors: state.actors, world: step.apply(world) },
      falselyFinalized: false,
    });
  }
  return out;
}

export async function explore(scenario: Scenario): Promise<Exploration> {
  const trees = new ActorTrees(scenario);
  await trees.build();
  const initial: State = {
    actors: scenario.actors.map((spec) =>
      spec.entry === "page load" ? "idle" : settle(trees.root(spec.slot, spec.entry)),
    ),
    world: EMPTY_WORLD,
  };

  // Small integers keep state keys short: the search visits many states.
  const interned = new Map<string, number>([[POINTER_KEY, 0]]);
  const intern = (text: string): number => {
    let id = interned.get(text);
    if (id === undefined) {
      id = interned.size;
      interned.set(text, id);
    }
    return id;
  };
  const worldKeys = new WeakMap<World, string>();
  const stateKey = ({ actors, world }: State): string => {
    let key = worldKeys.get(world);
    if (key === undefined) {
      key = [
        world.pointer === undefined ? "-" : intern(world.pointer),
        world.txs.map((tx) => `${intern(tx.hash)}${tx.status[0]}`).join(","),
        world.saved.map(intern).join(","),
        world.clobbered.map(intern).join(","),
        world.unsaved.map((u) => `${intern(u.requestId)}@${intern(u.endedOn)}`).join(","),
      ].join("|");
      worldKeys.set(world, key);
    }
    return `${actors.map((a) => (typeof a === "string" ? a[0] : a.canon)).join(",")}|${key}`;
  };

  const seen = new Set<string>([stateKey(initial)]);
  // Per state: the state it was first reached from, and which of that state's steps led here.
  const trail: ({ from: number; ordinal: number } | undefined)[] = [undefined];
  const queue: (State | undefined)[] = [initial];
  const classified = new Map<ClassName, string[]>();
  const unexplained = new Map<Rule, string[]>();
  let transitions = 0;

  // Labels are built only for a path that is reported, by replaying it from the start.
  const pathTo = (index: number): string[] => {
    const ordinals: number[] = [];
    for (let link = trail[index]; link; link = trail[link.from]) {
      ordinals.unshift(link.ordinal);
    }
    const path: string[] = [];
    let state = initial;
    for (const ordinal of ordinals) {
      const step = successors(trees, state)[ordinal];
      if (!step) {
        throw new HarnessError("a recorded path does not replay: the search is not deterministic");
      }
      path.push(step.text());
      state = step.state;
    }
    return path;
  };

  for (let i = 0; i < queue.length; i++) {
    const state = queue[i];
    queue[i] = undefined;
    if (!state) {
      continue;
    }
    for (const [ordinal, t] of successors(trees, state).entries()) {
      transitions++;
      if (t.falselyFinalized && !unexplained.has("NoFalseAlreadyFinalized")) {
        unexplained.set("NoFalseAlreadyFinalized", [...pathTo(i), t.text()]);
      }
      const key = stateKey(t.state);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const j = queue.push(t.state) - 1;
      trail.push({ from: i, ordinal });
      for (const v of violations(t.state)) {
        const name = (Object.keys(CLASSES) as ClassName[]).find((c) =>
          CLASSES[c].matches(v, t.state.world),
        );
        if (name !== undefined) {
          if (!classified.has(name)) {
            classified.set(name, pathTo(j));
          }
        } else if (!unexplained.has(v.rule)) {
          unexplained.set(v.rule, pathTo(j));
        }
      }
    }
  }
  return { states: queue.length, transitions, sdkRuns: trees.sdkRuns, classified, unexplained };
}
