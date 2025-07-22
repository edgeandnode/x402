import { Account, Chain, Address, Hex, Transport, getAddress } from "viem";
import { DeferredPaymentPayload, DEFERRRED_SCHEME } from "../../../types/verify/schemes/deferred";
import { PaymentRequirements, VerifyResponse } from "../../../types";
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
 * - ✅ Validates the voucher expiration and timestamp dates make sense
 *
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns The payment requirements if valid, otherwise an error object
 */
export async function verifyPaymentRequirements(
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse | undefined> {
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

  // Verify payload matches requirements: voucher expiration and timestamp
  const now = Math.floor(Date.now() / 1000);
  if (paymentPayload.payload.voucher.expiry < now) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (paymentPayload.payload.voucher.timestamp > now) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_timestamp",
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
export async function verifyVoucherSignature(
  paymentPayload: DeferredPaymentPayload,
): Promise<VerifyResponse | undefined> {
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
): Promise<VerifyResponse | undefined> {
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
  // buyer has to cover the outstanding amount
  let voucherOutstandingAmount: bigint;
  try {
    [voucherOutstandingAmount] = await client.readContract({
      address: paymentPayload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "getOutstandingAndCollectableAmount",
      args: [
        {
          id: paymentPayload.payload.voucher.id as Hex,
          buyer: paymentPayload.payload.voucher.buyer as Address,
          seller: paymentPayload.payload.voucher.seller as Address,
          valueAggregate: BigInt(paymentPayload.payload.voucher.valueAggregate),
          asset: paymentPayload.payload.voucher.asset as Address,
          timestamp: BigInt(paymentPayload.payload.voucher.timestamp),
          nonce: BigInt(paymentPayload.payload.voucher.nonce),
          escrow: paymentPayload.payload.voucher.escrow as Address,
          chainId: BigInt(paymentPayload.payload.voucher.chainId),
          expiry: BigInt(paymentPayload.payload.voucher.expiry),
        },
      ],
    });
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_outstanding_amount",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  let buyerAccount: {
    balance: bigint;
    thawingAmount: bigint;
    thawEndTime: bigint;
  };
  try {
    buyerAccount = await client.readContract({
      address: paymentPayload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "getAccount",
      args: [
        paymentPayload.payload.voucher.buyer as Address,
        paymentPayload.payload.voucher.seller as Address,
        paymentPayload.payload.voucher.asset as Address,
      ],
    });
  } catch (error) {
    console.log(error);
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_account",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (buyerAccount.balance < voucherOutstandingAmount) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
}
