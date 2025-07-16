export const deferredEscrowABI = [
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
    ],
    name: "isCollected",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    name: "collect",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "data",
        type: "bytes",
      },
    ],
    outputs: [],
  },
] as const;
