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
  {
    inputs: [
      {
        internalType: "address",
        name: "buyer",
        type: "address",
      },
      {
        internalType: "address",
        name: "seller",
        type: "address",
      },
      {
        internalType: "address",
        name: "asset",
        type: "address",
      },
    ],
    name: "accounts",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "balance",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "thawingAmount",
            type: "uint256",
          },
          {
            internalType: "uint64",
            name: "thawEndTime",
            type: "uint64",
          },
        ],
        internalType: "struct IDeferredPaymentEscrow.EscrowAccount",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
