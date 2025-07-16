import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSigner } from "../../../types/shared/evm";
import { signVoucher, verifyVoucher } from "./sign";

const buyer = createSigner(
  "base-sepolia",
  "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
);
const buyerAddress = buyer.account.address;
const anotherBuyerAddress = "0x9234567890123456789012345678901234567890";
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffffff12345678901234567890123456789fffff";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";

describe("voucher signature", () => {
  const mockVoucher = {
    id: voucherId,
    buyer: buyerAddress,
    seller: sellerAddress,
    value: "1000000",
    asset: assetAddress,
    timestamp: 1715769600,
    nonce: 0,
    escrow: escrowAddress,
    chainId: 84532,
  };

  const mockVoucherSignature =
    "0xca991563e3929ae2027b7c8bda0fc580ad1c2390f7831ae814a2b5ec5c31e22d7e5efced8d66dd7eccb5fba63e85ffa6ae1583b0c5e85c2baf1a3aaf639e465f1c";

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed time for consistent testing
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid voucher signature", async () => {
    const signature = await signVoucher(buyer, mockVoucher);
    expect(signature.signature).toBe(mockVoucherSignature);
  });

  it("should verify a valid voucher signature", async () => {
    const isValid = await verifyVoucher(mockVoucher, mockVoucherSignature, buyerAddress);
    expect(isValid).toBe(true);
  });

  it("should return false if voucher signature is valid but for a different buyer", async () => {
    const isValid = await verifyVoucher(mockVoucher, mockVoucherSignature, anotherBuyerAddress);
    expect(isValid).toBe(false);
  });
});
