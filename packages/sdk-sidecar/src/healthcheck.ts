import { credentials, Metadata } from "@grpc/grpc-js";
import { SidecarServiceClient } from "./generated/zama/sdk/v1alpha1/sidecar.js";

const client = new SidecarServiceClient(
  `unix:${process.env.SIDECAR_SOCKET_PATH}`,
  credentials.createInsecure(),
);
client.getInfo({}, new Metadata(), { deadline: Date.now() + 2_000 }, (error) => {
  client.close();
  process.exitCode = error ? 1 : 0;
});
