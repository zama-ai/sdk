import { lstat } from "node:fs/promises";
import { credentials, Metadata } from "@grpc/grpc-js";
import { DaemonServiceClient } from "./generated/zama/sdk/v1beta1/daemon.js";

const socketPath = process.env.ZAMA_SDK_DAEMON_SOCKET_PATH ?? "";
// Node cannot read a socket's peer credentials, so check the owner of the
// socket file: only a socket this user created can be this daemon's.
const socket = await lstat(socketPath).catch(() => undefined);
if (!socket?.isSocket() || socket.uid !== process.geteuid?.()) {
  process.exitCode = 1;
} else {
  const client = new DaemonServiceClient(`unix:${socketPath}`, credentials.createInsecure());
  client.getInfo({}, new Metadata(), { deadline: Date.now() + 2_000 }, (error) => {
    client.close();
    process.exitCode = error ? 1 : 0;
  });
}
