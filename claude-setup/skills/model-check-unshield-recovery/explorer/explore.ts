// Exhaustive interleaving explorer for the two-phase unshield.
//
// A global state is where each SDK call is (the answers it has had so far)
// plus the shared world (storage and chain). A step answers one pending call
// of one actor (it returns, it throws, or the tab closes), starts the page
// load, or mines one pending transaction. The search is breadth-first and
// skips states it has seen, so the first path that breaks a rule is a
// shortest one.
//
// The real WrappedToken decides what each actor does next. An actor's next
// call depends only on the answers it has had, so before the search the
// explorer runs the real code once for every answer sequence an actor can get
// (`runSdkCall`). That gives one tree per actor. Two nodes whose subtrees are
// equal (same calls, same derived facts, same endings) count as one state:
// for example, `unwrapRequester` returning the requester or throwing both
// make `#isUnwrapRequestConsumed` return false, and the code goes on the same.
import {
  HarnessError,
  runSdkCall,
  type Answer,
  type Entry,
  type Hex,
  type Outcome,
  type RunResult,
  type Step,
} from "./sdk-call";
import {
  callLabel,
  chainSteps,
  EMPTY_WORLD,
  isPointerKey,
  options,
  parsePointer,
  pointer,
  pretty,
  requestStatus,
  unwrapTx,
  type Option,
  type Pointer,
  type World,
} from "./world";

export const RULES = [
  "PendingUnshieldIsDiscoverable",
  "PointerKeptAfterSave",
  "NoFalseAlreadyFinalized",
] as const;
export type Rule = (typeof RULES)[number];

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
  /** Once its unwrap is sent, an unshield call never throws or stops before `savePendingUnshield` lands. */
  phase1AlwaysSaves: boolean;
}

export interface Exploration {
  states: number;
  transitions: number;
  /** Real SDK calls run to build the actor trees. */
  sdkRuns: number;
  /** For each broken rule, a shortest path that breaks it. */
  broken: Map<Rule, string[]>;
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
  /** An unshield call: `storage.set` of the pending-unshield key has returned. */
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

function deriveNode(slot: number, entry: Entry, script: Step[], run: RunResult, from?: Node): Node {
  const node: Node = {
    slot,
    entry,
    script,
    run,
    hash: from ? from.hash : entry.kind === "resumeUnshield" ? entry.hash : undefined,
    pointerRead: from?.pointerRead,
    saved: from?.saved ?? false,
    children: new Map(),
    steps: [],
    canon: -1,
  };
  const last = script.at(-1);
  if (last?.answer.kind === "ok") {
    const { call, answer } = last;
    if (call.kind === "signer.writeContract" && call.functionName === "unwrap") {
      node.hash = answer.value as Hex;
    } else if (call.kind === "storage.get" && isPointerKey(call.key)) {
      node.pointerRead = answer.value as string | null;
      if (typeof answer.value === "string") {
        node.hash = parsePointer(answer.value).unwrapTxHash;
      }
    } else if (
      call.kind === "storage.set" &&
      isPointerKey(call.key) &&
      (entry.kind === "unshield" || entry.kind === "unshieldAll")
    ) {
      node.saved = true;
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
    if (call.kind === "storage.set" && isPointerKey(call.key)) {
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
      node.run,
      node.hash ?? null,
      node.pointerRead === undefined ? "unread" : node.pointerRead,
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

const pointers = new WeakMap<World, Pointer | null>();
function cachedPointer(world: World): Pointer | null {
  let stored = pointers.get(world);
  if (stored === undefined) {
    stored = pointer(world);
    const unwrapTxHash = stored?.unwrapTxHash;
    const tx = world.txs.find((t) => t.hash === unwrapTxHash);
    if (stored && tx?.requestId !== stored.unwrapRequestId) {
      throw new HarnessError("the stored pointer names a request that its unwrap tx did not open");
    }
    pointers.set(world, stored);
  }
  return stored;
}

function breaks(rule: Rule, state: State): boolean {
  const { world } = state;
  const stored = cachedPointer(world);
  if (rule === "PointerKeptAfterSave") {
    return world.saved.some(
      (r) => requestStatus(world, r) === "open" && stored?.unwrapRequestId !== r,
    );
  }
  if (rule === "PendingUnshieldIsDiscoverable") {
    if (stored && requestStatus(world, stored.unwrapRequestId) === "open") {
      return false;
    }
    const working = new Set<Hex | undefined>(
      state.actors.map((a) =>
        typeof a === "object" ? world.txs.find((tx) => tx.hash === a.hash)?.requestId : undefined,
      ),
    );
    return world.txs.some(
      (tx) =>
        tx.kind === "unwrap" &&
        !working.has(tx.requestId) &&
        requestStatus(world, tx.requestId) === "open",
    );
  }
  return false;
}

function settle(node: Node): ActorState {
  return node.run.next.kind === "done" ? "done" : node;
}

function withActor(state: State, index: number, actor: ActorState, world: World): State {
  const actors = [...state.actors];
  actors[index] = actor;
  return { actors, world };
}

function successors(trees: ActorTrees, state: State): Transition[] {
  const out: Transition[] = [];
  const { world } = state;
  const { scenario } = trees;
  for (const [index, spec] of scenario.actors.entries()) {
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
    const okOnly =
      scenario.phase1AlwaysSaves && spec.entry !== "page load" && actor.hash && !actor.saved;
    for (const { option, child } of actor.steps) {
      if ((option.when && !option.when(world)) || (okOnly && option.answer.kind !== "ok")) {
        continue;
      }
      if (!child) {
        out.push({
          text: () => `${spec.name}: tab closes while waiting on ${callLabel(call)}`,
          state: withActor(state, index, "done", world),
          falselyFinalized: false,
        });
        continue;
      }
      const next = option.apply ? option.apply(world) : world;
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

// Small integers keep state keys short: the explorer visits many states.
const interned = new Map<string, number>();
function intern(text: string): number {
  let id = interned.get(text);
  if (id === undefined) {
    id = interned.size;
    interned.set(text, id);
  }
  return id;
}

const worldKeys = new WeakMap<World, string>();
function worldKey(world: World): string {
  let key = worldKeys.get(world);
  if (key === undefined) {
    const storage = [...world.storage].map(([k, v]) => `${intern(k)}=${intern(v)}`).sort();
    const txs = world.txs.map((tx) => `${intern(tx.hash)}${tx.status[0]}`);
    key = `${storage.join(",")}|${txs.join(",")}|${world.saved.map(intern).join(",")}`;
    worldKeys.set(world, key);
  }
  return key;
}

function stateKey(state: State): string {
  const actors = state.actors.map((a) => (typeof a === "string" ? a[0] : a.canon));
  return `${actors.join(",")}|${worldKey(state.world)}`;
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

  const seen = new Set<string>([stateKey(initial)]);
  // Per state: the state it was first reached from, and which of that state's steps led here.
  const trail: ({ from: number; ordinal: number } | undefined)[] = [undefined];
  const queue: (State | undefined)[] = [initial];
  const broken = new Map<Rule, string[]>();
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
      if (t.falselyFinalized && !broken.has("NoFalseAlreadyFinalized")) {
        broken.set("NoFalseAlreadyFinalized", [...pathTo(i), t.text()]);
      }
      const key = stateKey(t.state);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const j = queue.push(t.state) - 1;
      trail.push({ from: i, ordinal });
      for (const rule of ["PendingUnshieldIsDiscoverable", "PointerKeptAfterSave"] as const) {
        if (!broken.has(rule) && breaks(rule, t.state)) {
          broken.set(rule, pathTo(j));
        }
      }
    }
  }
  return { states: queue.length, transitions, sdkRuns: trees.sdkRuns, broken };
}
