import { Account, Chain, Address, Hex, Transport, getAddress } from "viem";
import { DeferredPaymentPayload, DEFERRRED_SCHEME } from "../../../types/verify/schemes/deferred";
import { PaymentRequirements } from "../../../types";
import { getNetworkId } from "../../../shared";
import { verifyVoucher } from "./sign";
import { ConnectedClient } from "../../../types/shared/evm/wallet";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";

/**
 * Verifies the payment payload match the payment requirements
 *
 * - ✅ Verify scheme is deferred
 * - ✅ Verify network matches payment requirements
 * - ✅ Verify voucher value is enough to cover maxAmountRequired
 * - ✅ Verify payTo is voucher seller
 * - ✅ Verify voucher asset matches payment requirements
 * - ✅ Validates the voucher chainId matches the chain specified in the payment requirements
 *
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns The payment requirements if valid, otherwise an error object
 */
export async function verifyPaymentRequirements(
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: PaymentRequirements,
) {
  // Verify payload matches requirements: scheme
  if (paymentPayload.scheme !== DEFERRRED_SCHEME) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_scheme`,
    };
  }
  if (paymentRequirements.scheme !== DEFERRRED_SCHEME) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_requirements_scheme`,
    };
  }

  // Verify payload matches requirements: network
  if (paymentPayload.network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_network_mismatch`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: maxAmountRequired -- new vouchers
  // value in voucher should be enough to cover paymentRequirements.maxAmountRequired
  if (paymentRequirements.extra.type === "new") {
    if (
      BigInt(paymentPayload.payload.voucher.valueAggregate) <
      BigInt(paymentRequirements.maxAmountRequired)
    ) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  // Verify payload matches requirements: maxAmountRequired -- aggregate vouchers
  // value in voucher should be enough to cover paymentRequirements.maxAmountRequired plus previous voucher value
  if (paymentRequirements.extra.type === "aggregation") {
    if (
      BigInt(paymentPayload.payload.voucher.valueAggregate) <
      BigInt(paymentRequirements.maxAmountRequired) +
        BigInt(paymentRequirements.extra.voucher.valueAggregate)
    ) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  // Verify payload matches requirements: payTo
  if (getAddress(paymentPayload.payload.voucher.seller) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: asset
  if (paymentPayload.payload.voucher.asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  //Validates the voucher chainId matches the chain specified in the payment requirements
  let chainId: number;
  try {
    chainId = getNetworkId(paymentRequirements.network);
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network_unsupported`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (chainId !== paymentPayload.payload.voucher.chainId) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_chain_id`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
}

/**
 * Verifies the voucher signature is valid
 *
 * - ✅ Verify the voucher signature is valid
 * - ✅ Verify the voucher signer is the buyer
 *
 * @param paymentPayload - The payment payload to verify
 * @returns The payment requirements if valid, otherwise an error object
 */
export async function verifyVoucherSignature(paymentPayload: DeferredPaymentPayload) {
  const voucherSignatureIsValid = await verifyVoucher(
    paymentPayload.payload.voucher,
    paymentPayload.payload.signature as Hex,
    paymentPayload.payload.voucher.buyer as Address,
  );
  if (!voucherSignatureIsValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
}

/**
 * Verifies the onchain state allows the payment to be settled
 *
 * - ✅ (on-chain) Verifies the client is connected to the chain specified in the payment requirements
 * - ✅ (on-chain) Verifies buyer has sufficient asset balance
 * - ✅ (on-chain) Verifies the voucher id has not been already claimed
 * - ⌛ TODO: Simulate the transaction to ensure it will succeed
 *
 * @param client - The client to use for the onchain state verification
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns The payment requirements if valid, otherwise an error object
 */
export async function verifyOnchainState<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: PaymentRequirements,
) {
  let chainId: number;
  try {
    chainId = getNetworkId(paymentRequirements.network);
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network_unsupported`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify the client is connected to the chain specified in the payment requirements
  if (client.chain.id !== chainId) {
    return {
      isValid: false,
      invalidReason: "invalid_client_network",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify buyer has sufficient asset balance in the escrow contract
  let balance: bigint;
  try {
    const account = await client.readContract({
      address: paymentPayload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "accounts",
      args: [
        paymentPayload.payload.voucher.buyer as Address,
        paymentPayload.payload.voucher.seller as Address,
        paymentPayload.payload.voucher.asset as Address,
      ],
    });
    balance = account.balance;
  } catch {
    return {
      isValid: false,
      invalidReason: "insufficient_funds_contract_call_failed",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (balance < BigInt(paymentPayload.payload.voucher.valueAggregate)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify voucher id has not been already claimed
  let isCollected: boolean;
  try {
    isCollected = await client.readContract({
      address: paymentPayload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "isCollected",
      args: [paymentPayload.payload.voucher.id as Hex],
    });
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_contract_call_failed",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (isCollected) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_already_claimed",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
}
