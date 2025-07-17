import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigner } from "../../../types/shared/evm";
import { PaymentRequirements } from "../../../types/verify";
import { createPaymentHeader, preparePaymentHeader, signPaymentHeader } from "./client";
import {
  DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  DeferredPaymentPayloadSchema,
  DeferredPaymentRequirementsSchema,
  UnsignedDeferredPaymentPayload,
} from "../../../types/verify/schemes/deferred";
import { encodePayment } from "./utils/paymentUtils";

vi.mock("./utils/paymentUtils", () => ({
  encodePayment: vi.fn().mockReturnValue("encoded-payment-header"),
}));

const buyer = createSigner(
  "base-sepolia",
  "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
);
const buyerAddress = buyer.account.address;
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffffff12345678901234567890123456789fffff";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";

describe("preparePaymentHeader: new voucher", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
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
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid unsigned payment header", async () => {
    const paymentHeader = await preparePaymentHeader(buyerAddress, 1, mockPaymentRequirements);

    const parsedPaymentRequirements =
      DeferredPaymentRequirementsSchema.parse(mockPaymentRequirements);

    expect(paymentHeader).toEqual({
      x402Version: 1,
      scheme: "deferred",
      network: "base-sepolia",
      payload: {
        signature: undefined,
        voucher: {
          id: voucherId,
          buyer: buyerAddress,
          seller: sellerAddress,
          value: parsedPaymentRequirements.maxAmountRequired,
          asset: assetAddress,
          timestamp: expect.any(Number),
          nonce: 0,
          escrow: escrowAddress,
          chainId: 84532,
        },
      },
    });
  });

  it("should revert if paymentRequirement.extra required fields are missing", async () => {
    const requiredFields = ["id", "escrow"];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      delete badPaymentRequirements.extra!.voucher[field];
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should revert if paymentRequirement.extra required fields have invalid values", async () => {
    const requiredFields = ["id", "escrow"];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      badPaymentRequirements.extra!.voucher[field] = "0x";
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should handle different x402 versions", async () => {
    const result = await preparePaymentHeader(buyerAddress, 2, mockPaymentRequirements);
    expect(result.x402Version).toBe(2);
  });
});

describe("preparePaymentHeader: aggregated voucher", () => {
  const mockAggregatedPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: {
      type: "aggregation",
      signature:
        "0xca991563e3929ae2027b7c8bda0fc580ad1c2390f7831ae814a2b5ec5c31e22d7e5efced8d66dd7eccb5fba63e85ffa6ae1583b0c5e85c2baf1a3aaf639e465f1c",
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        value: "1000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 0,
        escrow: escrowAddress,
        chainId: 84532,
      },
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid unsigned payment header", async () => {
    const paymentHeader = await preparePaymentHeader(
      buyerAddress,
      1,
      mockAggregatedPaymentRequirements,
    );

    const parsedExtra = DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema.parse(
      mockAggregatedPaymentRequirements.extra,
    );

    expect(paymentHeader).toEqual({
      x402Version: 1,
      scheme: "deferred",
      network: "base-sepolia",
      payload: {
        signature: undefined,
        voucher: {
          id: voucherId,
          buyer: buyerAddress,
          seller: sellerAddress,
          value: (
            BigInt(mockAggregatedPaymentRequirements.maxAmountRequired) +
            BigInt(parsedExtra.voucher.value)
          ).toString(),
          asset: assetAddress,
          timestamp: expect.any(Number),
          nonce: 1,
          escrow: escrowAddress,
          chainId: 84532,
        },
      },
    });
  });

  it("should revert if voucher signature is invalid", async () => {
    // Inject incorrect signature into mockAggregatedPaymentRequirements
    const paymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
    // @ts-expect-error - TODO: fix this
    paymentRequirements.extra!.signature =
      "0x79ce97f6d1242aa7b6f4826efb553ed453fd6c7132c665d95bc226d5f3027dd5456d61ed1bd8da5de6cea4d8154070ff458300b6b84e0c9010f434af77ad3d291c";

    await expect(preparePaymentHeader(buyerAddress, 1, paymentRequirements)).rejects.toThrow(
      "Invalid voucher signature",
    );
  });

  it("should revert if paymentRequirement.extra required fields are missing", async () => {
    const requiredFields = [
      "id",
      "buyer",
      "seller",
      "value",
      "asset",
      "timestamp",
      "nonce",
      "escrow",
      "chainId",
    ];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      delete badPaymentRequirements.extra!.voucher[field];
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should revert if paymentRequirement.extra required fields have invalid values", async () => {
    const requiredFields = [
      "id",
      "buyer",
      "seller",
      "value",
      "asset",
      "timestamp",
      "nonce",
      "escrow",
      "chainId",
    ];
    for (const field of requiredFields) {
      const badPaymentRequirements = structuredClone(mockAggregatedPaymentRequirements);
      // @ts-expect-error - TODO: fix this
      badPaymentRequirements.extra!.voucher[field] = "0x";
      await expect(preparePaymentHeader(buyerAddress, 1, badPaymentRequirements)).rejects.toThrow();
    }
  });

  it("should handle different x402 versions", async () => {
    const result = await preparePaymentHeader(buyerAddress, 2, mockAggregatedPaymentRequirements);
    expect(result.x402Version).toBe(2);
  });
});

describe("signPaymentHeader", () => {
  const mockUnsignedHeader: UnsignedDeferredPaymentPayload = {
    x402Version: 1,
    scheme: "deferred",
    network: "base-sepolia",
    payload: {
      signature: undefined,
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        value: "1000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 0,
        escrow: escrowAddress,
        chainId: 84532,
      },
    },
  };
  const mockVoucherSignature =
    "0xca991563e3929ae2027b7c8bda0fc580ad1c2390f7831ae814a2b5ec5c31e22d7e5efced8d66dd7eccb5fba63e85ffa6ae1583b0c5e85c2baf1a3aaf639e465f1c";

  it("should sign the payment header and return a complete payload", async () => {
    const signedPaymentPayload = await signPaymentHeader(buyer, mockUnsignedHeader);

    expect(signedPaymentPayload).toEqual({
      ...mockUnsignedHeader,
      payload: {
        ...mockUnsignedHeader.payload,
        signature: mockVoucherSignature,
      },
    });
  });

  it("should preserve all original fields in the signed payload", async () => {
    let signedPaymentPayload = await signPaymentHeader(buyer, mockUnsignedHeader);
    signedPaymentPayload = DeferredPaymentPayloadSchema.parse(signedPaymentPayload);

    // Check that all original fields are preserved
    expect(signedPaymentPayload.x402Version).toBe(mockUnsignedHeader.x402Version);
    expect(signedPaymentPayload.scheme).toBe(mockUnsignedHeader.scheme);
    expect(signedPaymentPayload.network).toBe(mockUnsignedHeader.network);
    expect(signedPaymentPayload.payload.voucher).toEqual(mockUnsignedHeader.payload.voucher);
  });

  it("should throw an error if signing fails", async () => {
    const badUnsignedHeader = {} as UnsignedDeferredPaymentPayload;
    await expect(signPaymentHeader(buyer, badUnsignedHeader)).rejects.toThrow();
  });
});

describe("createPaymentHeader", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "deferred",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: {
      type: "aggregation",
      signature:
        "0xca991563e3929ae2027b7c8bda0fc580ad1c2390f7831ae814a2b5ec5c31e22d7e5efced8d66dd7eccb5fba63e85ffa6ae1583b0c5e85c2baf1a3aaf639e465f1c",
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        value: "1000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 0,
        escrow: escrowAddress,
        chainId: 84532,
      },
    },
  };

  const mockSignedPayment = {
    x402Version: 1,
    scheme: "deferred",
    network: "base-sepolia",
    payload: {
      signature:
        "0x583c4822217a0a8d9f079800a4abf48ea4f366438181cf24a53a95567e1430442d3c8974edbd0b9d3d9c0d1231c6bbf837848986a7157f7f6056e2f6d4d7433a1b",
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        value: "2000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 1,
        escrow: escrowAddress,
        chainId: 84532,
      },
    },
  };

  it("should create and encode a payment header", async () => {
    const result = await createPaymentHeader(buyer, 1, mockPaymentRequirements);
    expect(result).toBe("encoded-payment-header");
    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        scheme: "deferred",
        network: "base-sepolia",
        payload: expect.objectContaining({
          signature: expect.any(String),
          voucher: expect.objectContaining({
            id: mockSignedPayment.payload.voucher.id,
            buyer: mockSignedPayment.payload.voucher.buyer,
            seller: mockSignedPayment.payload.voucher.seller,
            value: mockSignedPayment.payload.voucher.value,
            asset: mockSignedPayment.payload.voucher.asset,
            timestamp: expect.any(Number),
            nonce: mockSignedPayment.payload.voucher.nonce,
            escrow: mockSignedPayment.payload.voucher.escrow,
            chainId: mockSignedPayment.payload.voucher.chainId,
          }),
        }),
      }),
    );
  });

  it("should throw an error if signing fails", async () => {
    await expect(createPaymentHeader(buyer, 1, {} as PaymentRequirements)).rejects.toThrow();
  });

  it("should throw an error if encoding fails", async () => {
    const error = new Error("Encoding failed");
    vi.mocked(encodePayment).mockImplementation(() => {
      throw error;
    });

    await expect(createPaymentHeader(buyer, 1, mockPaymentRequirements)).rejects.toThrow(
      "Encoding failed",
    );
  });
});
