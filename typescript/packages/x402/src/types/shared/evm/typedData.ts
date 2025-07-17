export const typedDataTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
  DeferredVoucher: [
    { name: "id", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "valueAggregate", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "escrow", type: "address" },
    { name: "chainId", type: "uint256" },
  ],
};

export const transferWithAuthorizationPrimaryType = "TransferWithAuthorization" as const;
export const deferredVoucherPrimaryType = "DeferredVoucher" as const;
