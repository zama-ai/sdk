import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { SidecarRuntime } from "./runtime.js";
import { invalidArgument, serviceError, SidecarError } from "./errors.js";

type ClientFrame<Reply> = {
  message?: { $case: "attach"; attach: rpc.ContextRequest } | { $case: "reply"; reply: Reply };
};

function attachChannel<Reply, Response>(
  stream: ServerDuplexStream<ClientFrame<Reply>, Response>,
  kind: "SIGNER" | "STORAGE",
  timeoutMs: number,
  attach: (contextId: string) => { reply(value: Reply): void },
): void {
  let attached: ReturnType<typeof attach> | undefined;
  const deadline = setTimeout(() => {
    stream.destroy(
      serviceError(
        new SidecarError(
          `${kind}_ATTACH_TIMEOUT`,
          status.DEADLINE_EXCEEDED,
          `Attach a ${kind.toLowerCase()} context within ${timeoutMs / 1000} seconds.`,
        ),
      ),
    );
  }, timeoutMs);
  deadline.unref();
  const clear = () => clearTimeout(deadline);
  stream.once("close", clear);
  stream.once("error", clear);
  stream.once("end", () => {
    clear();
    if (!attached) {
      stream.end();
    }
  });
  stream.on("data", ({ message }: ClientFrame<Reply>) => {
    try {
      if (!attached && message?.$case === "attach") {
        attached = attach(message.attach.contextId);
        clear();
      } else if (attached && message?.$case === "reply") {
        attached.reply(message.reply);
      } else {
        throw invalidArgument("Attach a context before replying to callback requests.");
      }
    } catch (error) {
      stream.destroy(serviceError(error));
    }
  });
}

export function signerChannel(runtime: SidecarRuntime): rpc.SidecarServiceServer["signerChannel"] {
  return (stream) =>
    attachChannel(stream, "SIGNER", 5000, (id) => runtime.attachSigner(id, stream));
}

export function storageChannel(
  runtime: SidecarRuntime,
): rpc.SidecarServiceServer["storageChannel"] {
  return (stream) =>
    attachChannel(stream, "STORAGE", 10_000, (id) => runtime.attachStorage(id, stream));
}
