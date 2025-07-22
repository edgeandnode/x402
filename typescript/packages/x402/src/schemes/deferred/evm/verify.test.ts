import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentRequirements } from "../../../types";
import { DeferredPaymentPayload, DEFERRRED_SCHEME } from "../../../types/verify/schemes/deferred";
import { verifyPaymentRequirements, verifyVoucherSignature, verifyOnchainState } from "./verify";
import { ConnectedClient } from "../../../types/shared/evm/wallet";
import { verifyVoucher } from "./sign";
import { getNetworkId } from "../../../shared";
import { Account, Chain, Transport } from "viem";

vi.mock("./sign", () => ({
  verifyVoucher: vi.fn(),
}));

vi.mock("../../../shared", () => ({
  getNetworkId: vi.fn(),
}));

const buyerAddress = "0xf33332f96E5EA32c90a5301b646Bf5e93EA1D892";
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffffff12345678901234567890123456789fffff";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";
const voucherSignature =
  "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

describe("verifyPaymentRequirements", () => {
  const mockVoucher = {
    id: voucherId,
    buyer: buyerAddress,
    seller: sellerAddress,
    valueAggregate: "1000000",
    asset: assetAddress,
    timestamp: 1715769600,
    nonce: 0,
    escrow: escrowAddress,
    chainId: 84532,
    expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
  };

  const mockPaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature,
      voucher: mockVoucher,
    },
  };

  const mockPaymentRequirements: PaymentRequirements = {
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: {
      type: "new",
      voucher: {
        id: voucherId,
        escrow: escrowAddress,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNetworkId).mockReturnValue(84532);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return undefined for valid payment requirements with new voucher", async () => {
    const result = await verifyPaymentRequirements(mockPaymentPayload, mockPaymentRequirements);
    expect(result).toBeUndefined();
  });

  it("should return undefined for valid payment requirements with aggregation voucher", async () => {
    const aggregationRequirements: PaymentRequirements = {
      ...mockPaymentRequirements,
      maxAmountRequired: "500000",
      extra: {
        type: "aggregation",
        signature: voucherSignature,
        voucher: {
          ...mockVoucher,
          valueAggregate: "500000",
        },
      },
    };
    const result = await verifyPaymentRequirements(mockPaymentPayload, aggregationRequirements);
    expect(result).toBeUndefined();
  });

  it("should return error if payload scheme is not deferred", async () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      scheme: "immediate",
    } as unknown as DeferredPaymentPayload;
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_scheme",
    });
  });

  it("should return error if requirements scheme is not deferred", async () => {
    const invalidRequirements = {
      ...mockPaymentRequirements,
      scheme: "immediate",
    } as unknown as PaymentRequirements;
    const result = await verifyPaymentRequirements(mockPaymentPayload, invalidRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_requirements_scheme",
    });
  });

  it("should return error if payment payload network does not match payment requirements network", async () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      network: "base",
    } as DeferredPaymentPayload;
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_network_mismatch",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher value is insufficient for new voucher", async () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          valueAggregate: "999999",
        },
      },
    };
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher value is insufficient for aggregation voucher", async () => {
    const aggregationRequirements: PaymentRequirements = {
      ...mockPaymentRequirements,
      extra: {
        type: "aggregation",
        signature: voucherSignature,
        voucher: {
          ...mockVoucher,
          valueAggregate: "500000",
        },
      },
    };
    const result = await verifyPaymentRequirements(mockPaymentPayload, aggregationRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: buyerAddress,
    });
  });

  it("should return error if payTo does not match voucher seller", async () => {
    const invalidRequirements = {
      ...mockPaymentRequirements,
      payTo: "0x9999999999999999999999999999999999999999",
    };
    const result = await verifyPaymentRequirements(mockPaymentPayload, invalidRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: buyerAddress,
    });
  });

  it("should return error if asset mismatch", async () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          asset: "0x2222222222222222222222222222222222222222",
        },
      },
    };
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: buyerAddress,
    });
  });

  it("should return error if network is not supported", async () => {
    vi.mocked(getNetworkId).mockImplementation(() => {
      throw new Error("Unsupported network");
    });
    const result = await verifyPaymentRequirements(mockPaymentPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_network_unsupported",
      payer: buyerAddress,
    });
  });

  it("should return error if chainId mismatch", async () => {
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          chainId: 1,
        },
      },
    };
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_chain_id",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher is expired", async () => {
    const now = Math.floor(Date.now() / 1000);
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          expiry: now - 1, // 1 second in the past
        },
      },
    };
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: buyerAddress,
    });
  });

  it("should return error if voucher timestamp is in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    const invalidPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        voucher: {
          ...mockVoucher,
          timestamp: now + 3600, // 1 hour in the future
        },
      },
    };
    const result = await verifyPaymentRequirements(invalidPayload, mockPaymentRequirements);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_timestamp",
      payer: buyerAddress,
    });
  });
});

describe("verifyVoucherSignature", () => {
  const mockPaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature,
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        valueAggregate: "1000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 0,
        escrow: escrowAddress,
        chainId: 84532,
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return undefined for valid voucher signature", async () => {
    vi.mocked(verifyVoucher).mockResolvedValue(true);
    const result = await verifyVoucherSignature(mockPaymentPayload);
    expect(result).toBeUndefined();
    expect(vi.mocked(verifyVoucher)).toHaveBeenCalledWith(
      mockPaymentPayload.payload.voucher,
      voucherSignature,
      buyerAddress,
    );
  });

  it("should return error for invalid voucher signature", async () => {
    vi.mocked(verifyVoucher).mockResolvedValue(false);
    const result = await verifyVoucherSignature(mockPaymentPayload);
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: buyerAddress,
    });
  });
});

describe("verifyOnchainState", () => {
  const mockPaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature,
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        valueAggregate: "1000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 0,
        escrow: escrowAddress,
        chainId: 84532,
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };

  const mockPaymentRequirements: PaymentRequirements = {
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: {
      type: "new",
      voucher: {
        id: voucherId,
        escrow: escrowAddress,
      },
    },
  };

  let mockClient: ConnectedClient<Transport, Chain, Account>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNetworkId).mockReturnValue(84532);
    mockClient = {
      chain: { id: 84532 },
      readContract: vi.fn(),
    } as unknown as ConnectedClient<Transport, Chain, Account>;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return undefined for valid onchain state", async () => {
    vi.mocked(mockClient.readContract)
      .mockResolvedValueOnce([BigInt(1_000_000)])
      .mockResolvedValueOnce({ balance: BigInt(10_000_000) });

    const result = await verifyOnchainState(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
    );
    expect(result).toBeUndefined();
  });

  it("should return error if network is not supported", async () => {
    vi.mocked(getNetworkId).mockImplementation(() => {
      throw new Error("Unsupported network");
    });
    const result = await verifyOnchainState(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_network_unsupported",
      payer: buyerAddress,
    });
  });

  it("should return error if client network mismatch", async () => {
    mockClient.chain.id = 1;
    const result = await verifyOnchainState(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_client_network",
      payer: buyerAddress,
    });
  });

  it("should return error if outstanding amount check fails", async () => {
    vi.mocked(mockClient.readContract).mockRejectedValueOnce(new Error("Contract call failed"));
    const result = await verifyOnchainState(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_outstanding_amount",
      payer: buyerAddress,
    });
  });

  it("should return error if balance check fails", async () => {
    vi.mocked(mockClient.readContract)
      .mockResolvedValueOnce([BigInt(1_000_000)])
      .mockRejectedValueOnce(new Error("Contract call failed"));
    const result = await verifyOnchainState(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_account",
      payer: buyerAddress,
    });
  });

  it("should return error if insufficient balance", async () => {
    vi.mocked(mockClient.readContract)
      .mockResolvedValueOnce([BigInt(1_000_000)])
      .mockResolvedValueOnce({ balance: BigInt(100_000) });

    const result = await verifyOnchainState(
      mockClient,
      mockPaymentPayload,
      mockPaymentRequirements,
    );
    expect(result).toEqual({
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: buyerAddress,
    });
  });
});
