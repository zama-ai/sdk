// Breadth-first search over every interleaving of SDK calls and chain steps,
// run against the real WrappedToken.
//
// A global state is where each SDK call is (the answers it has had so far)
// plus the shared world. A step answers one pending call of one actor (it
// returns, it throws, or the tab closes), starts the page load, or mines the
// next transaction. The real code decides each actor's next call: the first
// time a state needs an answer sequence, `runSdkCall` runs the SDK call with
// that sequence, and the result is kept.
//
// Every state reached is checked against the rules. A rule break is allowed
// only inside one of the BOUNDS; the first example of each is a shortest one.
import type { Hex } from "viem";
import {
  HarnessError,
  runSdkCall,
  type Answer,
  type Call,
  type Entry,
  type Outcome,
  type RunResult,
  type Step,
} from "./sdk-call";
import {
  callLabel,
  chainSteps,
  EMPTY_WORLD,
  INTERRUPTED_WORLD,
  isUnwrapTx,
  options,
  pretty,
  requestOfTx,
  requestStatus,
  STALE_ENTRY_WORLD,
  storedHashes,
  storedRequests,
  unwrapTx,
  type World,
} from "./world";

export type Rule =
  /** An open unwrap request that no SDK call is working on has a stored entry. */
  | "PendingUnshieldIsDiscoverable"
  /** A stored entry stays until its request is finalized. */
  | "EntryKeptAfterSave"
  /** The SDK reports "already finalized" only for a request that is finalized on chain. */
  | "NoFalseAlreadyFinalized"
  /**
   * getPendingUnshield() never returns a hash whose unwrap it saw revert or
   * open no request, so a dead entry cannot hide newer ones.
   */
  | "NoDeadEntryReported";

interface Violation {
  rule: Rule;
  requestId: Hex;
}

const SAVE_WINDOW = new Set<string>(["storage.get", "storage.set", "storage failure"]);

/** Rule breaks the SDK cannot prevent with get/set/delete storage. */
const BOUNDS = {
  /** The tab closed or storage failed between sending the unwrap and saving its entry. */
  "save window": (v: Violation, world: World) =>
    v.rule === "PendingUnshieldIsDiscoverable" &&
    SAVE_WINDOW.has(world.unsaved.find((u) => u.requestId === v.requestId)?.endedOn ?? ""),
  /** Two tabs read and wrote the entry list at once, and the later write dropped this entry. */
  "lost update": (v: Violation, world: World) => world.lostUpdate.includes(v.requestId),
} as const;
export type BoundName = keyof typeof BOUNDS;

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
  /**
   * An earlier unshield (U0) whose tab is gone, with its entry stored:
   * "interrupted" (its request is open) or "stale entry" (already finalized).
   */
  earlier?: "interrupted" | "stale entry";
}

export interface Exploration {
  states: number;
  transitions: number;
  /** Real SDK calls run. */
  sdkRuns: number;
  /** A shortest path into each bound that occurred. */
  bounded: Map<BoundName, string[]>;
  /** For each rule broken outside every bound, a shortest path that breaks it. */
  broken: Map<Rule, string[]>;
}

/** One SDK call after a given answer sequence: what the real code did next. */
interface Node {
  id: number;
  slot: number;
  entry: Entry;
  script: Step[];
  run: RunResult;
  /** The unwrap tx this SDK call works on, once it knows one. */
  hash?: Hex;
  /** The request whose state this SDK call read on chain since it last fetched an unwrap receipt. */
  requestId?: Hex;
  /** Unwrap txs whose receipt this SDK call saw reverted, or mined without opening a request. */
  sawDead: Hex[];
  /** getPendingUnshield: the stored value it read first, the list it goes through. */
  firstRead?: string | null;
  /** The stored value of this SDK call's latest `storage.get`, which its next write builds on. */
  lastRead?: string | null;
  /** An unshield call: it stored a list with its own unwrap tx. */
  saved: boolean;
  /** A storage call threw before the entry was saved. */
  storageFailed: boolean;
  children: Map<string, Node>;
}

type ActorState = Node | "idle" | "done";

interface State {
  actors: ActorState[];
  world: World;
}

interface Transition {
  text: () => string;
  state: State;
  /** A rule that this step itself breaks. */
  breaks?: Rule;
}

const answerKey = (answer: Answer): string => JSON.stringify(answer);
/** The request an SDK call is working on, once it knows one. */
const workingOn = (world: World, node: Node) => node.requestId ?? requestOfTx(world, node.hash);
const isUnshield = (entry: Entry) => entry.kind === "unshield" || entry.kind === "unshieldAll";

/** The SDK calls of a scenario, run on demand and kept by answer sequence. */
class Actors {
  readonly #roots = new Map<string, Node>();
  #nodes = 0;

  constructor(readonly scenario: Scenario) {}

  entries(spec: ActorSpec): Entry[] {
    if (spec.entry !== "page load") {
      return [spec.entry];
    }
    const slots = this.scenario.actors.filter((a) => a.entry !== "page load").map((a) => a.slot);
    const kept = (this.scenario.earlier ? [0, ...slots] : slots).map((slot): Entry => ({
      kind: "resumeUnshield",
      hash: unwrapTx(slot),
    }));
    return [{ kind: "getPendingUnshield" }, ...kept];
  }

  get sdkRuns(): number {
    return this.#nodes;
  }

  async root(slot: number, entry: Entry): Promise<Node> {
    const key = `${slot}|${JSON.stringify(entry)}`;
    let node = this.#roots.get(key);
    if (!node) {
      node = this.#node(slot, entry, [], await runSdkCall(entry, []));
      this.#roots.set(key, node);
    }
    return node;
  }

  async child(node: Node, call: Call, answer: Answer): Promise<Node> {
    const key = answerKey(answer);
    let child = node.children.get(key);
    if (!child) {
      // `answer` comes from `options(call)`, so it has the call's kind.
      const script = [...node.script, { kind: call.kind, call, answer } as Step];
      child = this.#node(node.slot, node.entry, script, await runSdkCall(node.entry, script), node);
      node.children.set(key, child);
    }
    return child;
  }

  #node(slot: number, entry: Entry, script: Step[], run: RunResult, from?: Node): Node {
    const node: Node = {
      id: this.#nodes++,
      slot,
      entry,
      script,
      run,
      hash: from ? from.hash : entry.kind === "resumeUnshield" ? entry.hash : undefined,
      requestId: from?.requestId,
      sawDead: from?.sawDead ?? [],
      firstRead: from?.firstRead,
      lastRead: from?.lastRead,
      saved: from?.saved ?? false,
      storageFailed: from?.storageFailed ?? false,
      children: new Map(),
    };
    const last = script.at(-1);
    if (last) {
      observe(node, last);
    }
    return node;
  }
}

/**
 * What `node` learns from its last answered step. The rules and bounds rely on
 * these facts, so each one states how it is derived.
 */
function observe(node: Node, step: Step): void {
  const { entry } = node;
  if (step.answer.kind !== "ok") {
    // A failed storage call before its own entry was stored: the save window bound.
    node.storageFailed ||= step.kind.startsWith("storage.") && !node.saved;
    return;
  }
  switch (step.kind) {
    case "signer.writeContract":
      // The hash the wallet returned for its own unwrap.
      if (step.call.functionName === "unwrap") {
        node.hash = step.answer.value;
      }
      return;
    case "provider.waitForTransactionReceipt":
    case "provider.getTransactionReceipt": {
      if (!isUnwrapTx(step.call.hash)) {
        return;
      }
      // An unwrap receipt it looked at: the request it works on now, read fresh.
      node.hash = step.call.hash;
      node.requestId = undefined;
      const receipt = step.answer.value;
      if (receipt && (receipt.status === "reverted" || !receipt.unwrapRequestId)) {
        node.sawDead = [...node.sawDead, step.call.hash];
      }
      return;
    }
    case "provider.readContract":
      node.requestId = step.call.requestId;
      return;
    case "storage.get":
      // getPendingUnshield reads the list once and goes through it; any later
      // read belongs to a clear.
      if (entry.kind === "getPendingUnshield" && node.firstRead === undefined) {
        node.firstRead = step.answer.value;
      }
      node.lastRead = step.answer.value;
      return;
    case "storage.set":
      node.saved ||=
        isUnshield(entry) &&
        node.hash !== undefined &&
        storedHashes(step.call.value).includes(node.hash);
      return;
    case "storage.delete":
    case "relayer.decryptPublicValuesWithSignatures":
      return;
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
  const { reported } = node.run;
  const report = reported
    ? pretty(
        `; getPendingUnshield() returns ${reported}, the app calls resumeUnshield(${reported})`,
      )
    : "";
  const end =
    node.run.next.kind === "done" ? `; ${name} ends: ${outcomeLabel(node.run.next.outcome)}` : "";
  return report + end;
}

/** The rule that the step reaching `node` itself breaks, if any. */
function stepBreaks(node: Node, world: World): Rule | undefined {
  // Its unwrap opened no request, so the hash can never be resumed, and it hides newer entries.
  if (node.run.reported && node.sawDead.includes(node.run.reported)) {
    return "NoDeadEntryReported";
  }
  if (node.run.next.kind !== "done") {
    return undefined;
  }
  const { outcome } = node.run.next;
  if (outcome.kind === "threw") {
    const r = outcome.unwrapRequestId;
    return r && requestStatus(world, r) !== "finalized" ? "NoFalseAlreadyFinalized" : undefined;
  }
  // getPendingUnshield returned null: it judged every entry it read settled.
  const judged = outcome.value === "null" && node.entry.kind === "getPendingUnshield";
  return judged &&
    storedRequests(world, node.firstRead).some((r) => requestStatus(world, r) === "open")
    ? "NoFalseAlreadyFinalized"
    : undefined;
}

/** PendingUnshieldIsDiscoverable and EntryKeptAfterSave, checked on every state. */
function violations(state: State): Violation[] {
  const { world } = state;
  const stored = new Set(storedRequests(world, world.stored));
  const lost = (r: Hex) => requestStatus(world, r) === "open" && !stored.has(r);
  const out: Violation[] = world.saved
    .filter(lost)
    .map((requestId) => ({ rule: "EntryKeptAfterSave", requestId }));
  const working = new Set(
    state.actors.map((a) => (typeof a === "object" ? workingOn(world, a) : undefined)),
  );
  for (const tx of world.txs) {
    if (tx.kind === "unwrap" && !working.has(tx.requestId) && lost(tx.requestId)) {
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
 * `next` plus what the bounds need about `actor`'s step from `world`: entries
 * of other requests that a write dropped because they were not in the list it
 * read (another tab stored them after the read), and where an unshield ended
 * before saving.
 * `child` is absent when the tab closed.
 */
function recordStep(world: World, next: World, actor: Node, child?: Node): World {
  let out = next;
  const own = workingOn(world, actor);
  // Only a write built on an earlier read can be a lost update; a blind write is a bug.
  if (next.stored !== world.stored && actor.lastRead !== undefined) {
    const kept = new Set(storedRequests(next, next.stored));
    const known = new Set(storedRequests(world, actor.lastRead));
    const dropped = storedRequests(world, world.stored).filter(
      (r) => r !== own && !kept.has(r) && !known.has(r),
    );
    out = { ...out, lostUpdate: [...new Set([...out.lostUpdate, ...dropped])].sort() };
  }
  const ended = !child || child.run.next.kind === "done";
  if (ended && isUnshield(actor.entry) && own && !(child ?? actor).saved) {
    const pending = actor.run.next.kind === "call" ? actor.run.next.call.kind : undefined;
    const endedOn = (child ?? actor).storageFailed ? "storage failure" : pending;
    if (!endedOn) {
      throw new HarnessError("an actor ended without a pending call");
    }
    out = { ...out, unsaved: [...out.unsaved, { requestId: own, endedOn }] };
  }
  return out;
}

async function successors(actors: Actors, state: State): Promise<Transition[]> {
  const out: Transition[] = [];
  const { world } = state;
  for (const [index, spec] of actors.scenario.actors.entries()) {
    const actor = state.actors[index];
    if (actor === "idle") {
      for (const entry of actors.entries(spec)) {
        if (entry.kind === "resumeUnshield" && !world.txs.some((tx) => tx.hash === entry.hash)) {
          continue;
        }
        const node = await actors.root(spec.slot, entry);
        const call =
          entry.kind === "resumeUnshield"
            ? `resumeUnshield(${entry.hash}) with a hash the app kept`
            : "getPendingUnshield()";
        out.push({
          text: () => pretty(`${spec.name}: ${call}`) + endText(spec.name, node),
          state: withActor(state, index, settle(node), world),
          breaks: stepBreaks(node, world),
        });
      }
      continue;
    }
    if (actor === undefined || actor === "done" || actor.run.next.kind !== "call") {
      continue;
    }
    const { call } = actor.run.next;
    for (const option of options(call, actor.slot, world)) {
      if (option.when && !option.when(world)) {
        continue;
      }
      if (option.answer.kind === "close") {
        out.push({
          text: () => `${spec.name}: tab closes while waiting on ${callLabel(call)}`,
          state: withActor(state, index, "done", recordStep(world, world, actor)),
        });
        continue;
      }
      const child = await actors.child(actor, call, option.answer);
      const next = recordStep(world, option.apply ? option.apply(world) : world, actor, child);
      out.push({
        text: () => `${spec.name}: ${callLabel(call)} ${option.text}${endText(spec.name, child)}`,
        state: withActor(state, index, settle(child), next),
        breaks: stepBreaks(child, next),
      });
    }
  }
  for (const step of chainSteps(world)) {
    out.push({ text: () => step.text, state: { actors: state.actors, world: step.apply(world) } });
  }
  return out;
}

/** `stopOnBreak`: return once any rule breaks, for callers that only need to know whether one does. */
export async function explore(
  scenario: Scenario,
  { stopOnBreak = false }: { stopOnBreak?: boolean } = {},
): Promise<Exploration> {
  const actors = new Actors(scenario);
  const initial: State = {
    actors: await Promise.all(
      scenario.actors.map(async (spec) =>
        spec.entry === "page load" ? "idle" : settle(await actors.root(spec.slot, spec.entry)),
      ),
    ),
    world:
      scenario.earlier === "interrupted"
        ? INTERRUPTED_WORLD
        : scenario.earlier === "stale entry"
          ? STALE_ENTRY_WORLD
          : EMPTY_WORLD,
  };

  // Small integers keep state keys short: the search visits many states.
  const interned = new Map<string, number>();
  const intern = (text: string): number => {
    let id = interned.get(text);
    if (id === undefined) {
      id = interned.size;
      interned.set(text, id);
    }
    return id;
  };
  const worldKeys = new WeakMap<World, string>();
  const stateKey = (state: State): string => {
    const { world } = state;
    let key = worldKeys.get(world);
    if (key === undefined) {
      key = [
        world.stored === undefined ? "-" : intern(world.stored),
        world.txs.map((tx) => `${intern(tx.hash)}${intern(tx.status)}`).join(","),
        world.saved.map(intern).join(","),
        world.lostUpdate.map(intern).join(","),
        world.unsaved.map((u) => `${intern(u.requestId)}@${intern(u.endedOn)}`).join(","),
      ].join("|");
      worldKeys.set(world, key);
    }
    return `${state.actors.map((a) => (typeof a === "string" ? a[0] : a.id)).join(",")}|${key}`;
  };

  const seen = new Set<string>([stateKey(initial)]);
  // Per state: the state it was first reached from, and which of that state's steps led here.
  const trail: ({ from: number; ordinal: number } | undefined)[] = [undefined];
  const queue: (State | undefined)[] = [initial];
  const bounded = new Map<BoundName, string[]>();
  const broken = new Map<Rule, string[]>();
  let transitions = 0;

  // Labels are built only for a path that is reported, by replaying it from the start.
  const pathTo = async (index: number): Promise<string[]> => {
    const ordinals: number[] = [];
    for (let link = trail[index]; link; link = trail[link.from]) {
      ordinals.unshift(link.ordinal);
    }
    const path: string[] = [];
    let state = initial;
    for (const ordinal of ordinals) {
      const step = (await successors(actors, state))[ordinal];
      if (!step) {
        throw new HarnessError("a recorded path does not replay: the search is not deterministic");
      }
      path.push(step.text());
      state = step.state;
    }
    return path;
  };

  for (let i = 0; i < queue.length; i++) {
    if (stopOnBreak && broken.size > 0) {
      break;
    }
    const state = queue[i];
    queue[i] = undefined;
    if (!state) {
      continue;
    }
    for (const [ordinal, t] of (await successors(actors, state)).entries()) {
      transitions++;
      if (t.breaks && !broken.has(t.breaks)) {
        broken.set(t.breaks, [...(await pathTo(i)), t.text()]);
      }
      const key = stateKey(t.state);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const j = queue.push(t.state) - 1;
      trail.push({ from: i, ordinal });
      for (const v of violations(t.state)) {
        const bound = (Object.keys(BOUNDS) as BoundName[]).find((b) => BOUNDS[b](v, t.state.world));
        if (bound !== undefined) {
          if (!bounded.has(bound)) {
            bounded.set(bound, await pathTo(j));
          }
        } else if (!broken.has(v.rule)) {
          broken.set(v.rule, await pathTo(j));
        }
      }
    }
  }
  return { states: queue.length, transitions, sdkRuns: actors.sdkRuns, bounded, broken };
}
