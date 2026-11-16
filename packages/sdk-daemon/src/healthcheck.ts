import { credentials, Metadata } from "@grpc/grpc-js";
import { DaemonServiceClient } from "./generated/zama/sdk/v1beta1/daemon.js";

const client = new DaemonServiceClient(
  `unix:${process.env.ZAMA_SDK_DAEMON_SOCKET_PATH}`,
  credentials.createInsecure(),
);
client.getInfo({}, new Metadata(), { deadline: Date.now() + 2_000 }, (error) => {
  client.close();
  process.exitCode = error ? 1 : 0;
});
