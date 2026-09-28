import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import type * as rpc from "./generated/zama/sdk/v1beta1/daemon.js";
import type { DaemonRuntime } from "./runtime.js";
import { DaemonError, invalidArgument, serviceError } from "./errors.js";

type ClientFrame<Reply> = {
  message?: { $case: "attach"; attach: rpc.ContextRequest } | { $case: "reply"; reply: Reply };
};

function attachChannel<Reply, Response>(
  stream: ServerDuplexStream<ClientFrame<Reply>, Response>,
  kind: "SIGNER" | "STORAGE" | "EVENT",
  timeoutMs: number,
  attach: (contextId: string) => { reply(value: Reply): void },
): void {
  let attached: ReturnType<typeof attach> | undefined;
  let closed = false;
  const deadline = setTimeout(() => {
    // grpc-js sends error trailers from its error handler; destroy() skips finalization.
    stream.emit(
      "error",
      serviceError(
        new DaemonError(
          `${kind}_ATTACH_TIMEOUT`,
          status.DEADLINE_EXCEEDED,
          `Attach a ${kind.toLowerCase()} context within ${timeoutMs / 1000} seconds.`,
        ),
      ),
    );
  }, timeoutMs);
  deadline.unref();
  const clear = () => clearTimeout(deadline);
  const close = () => {
    closed = true;
    clear();
    stream.off("data", receive);
  };
  stream.once("close", close);
  stream.once("error", close);
  stream.once("cancelled", close);
  stream.once("end", () => {
    close();
    if (!attached) {
      stream.end();
    }
  });
  function receive({ message }: ClientFrame<Reply>): void {
    if (closed) {
      return;
    }
    try {
      if (!attached && message?.$case === "attach") {
        attached = attach(message.attach.contextId);
        clear();
      } else if (attached && message?.$case === "reply") {
        attached.reply(message.reply);
      } else if (message?.$case === "attach") {
        throw invalidArgument("This callback stream is already attached.");
      } else if (!attached) {
        throw invalidArgument("The first callback frame must attach a context.");
      } else {
        throw invalidArgument("Expected a callback reply on the attached stream.");
      }
    } catch (error) {
      stream.emit("error", serviceError(error));
    }
  }
  stream.on("data", receive);
}

export function signerChannel(runtime: DaemonRuntime): rpc.DaemonServiceServer["signerChannel"] {
  return (stream) =>
    attachChannel(stream, "SIGNER", 5000, (id) => runtime.attachSigner(id, stream));
}

export function storageChannel(runtime: DaemonRuntime): rpc.DaemonServiceServer["storageChannel"] {
  return (stream) =>
    attachChannel(stream, "STORAGE", 10_000, (id) => runtime.attachStorage(id, stream));
}

export function eventChannel(runtime: DaemonRuntime): rpc.DaemonServiceServer["eventChannel"] {
  return (stream) => attachChannel(stream, "EVENT", 5000, (id) => runtime.attachEvents(id, stream));
}
