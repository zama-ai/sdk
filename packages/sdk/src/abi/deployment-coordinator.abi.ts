export const deploymentCoordinatorAbi = [
  {
    inputs: [{ internalType: "address", name: "originalToken", type: "address" }],
    name: "getWrapper",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "originalToken", type: "address" }],
    name: "wrapperExists",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
