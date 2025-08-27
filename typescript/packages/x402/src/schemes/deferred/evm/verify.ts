import { Account, Chain, Address, Hex, Transport, getAddress } from "viem";
import {
  DeferredEvmPayloadSignedVoucher,
  DeferredEvmPayloadSignedVoucherSchema,
  DeferredEvmPayloadVoucher,
  DeferredPaymentPayload,
  DeferredPaymentRequirements,
  DEFERRRED_SCHEME,
} from "../../../types/verify/schemes/deferred";
import { VerifyResponse } from "../../../types";
import { getNetworkId } from "../../../shared";
import { verifyVoucher } from "./sign";
import { ConnectedClient } from "../../../types/shared/evm/wallet";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";
import { VoucherStore } from "./store";

/**
 * Verifies the payment payload satisfies the payment requirements.
 *
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns Verification result
 */
export function verifyPaymentRequirements(
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: DeferredPaymentRequirements,
): VerifyResponse {
  // scheme
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

  // network
  if (paymentPayload.network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_network_mismatch`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
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

  // maxAmountRequired
  const requiredVoucherValueAggregate =
    paymentRequirements.extra.type === "new"
      ? BigInt(paymentRequirements.maxAmountRequired)
      : BigInt(paymentRequirements.maxAmountRequired) +
        BigInt(paymentRequirements.extra.voucher.valueAggregate);
  if (BigInt(paymentPayload.payload.voucher.valueAggregate) < requiredVoucherValueAggregate) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // payTo
  if (getAddress(paymentPayload.payload.voucher.seller) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // asset
  if (paymentPayload.payload.voucher.asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies the voucher structrure is valid and continuity is maintained
 *
 * @param paymentPayload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify
 * @returns Verification result
 */
export function verifyVoucherContinuity(
  paymentPayload: DeferredPaymentPayload,
  paymentRequirements: DeferredPaymentRequirements,
): VerifyResponse {
  const voucher = paymentPayload.payload.voucher;

  // expiration
  const now = Math.floor(Date.now() / 1000);
  if (voucher.expiry < now) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_expired",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // timestamp
  if (voucher.timestamp > now) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_timestamp_too_early",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // -- New voucher --
  if (paymentRequirements.extra.type === "new") {
    if (voucher.nonce != 0) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_non_zero_nonce",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    if (BigInt(voucher.valueAggregate) === 0n) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_zero_value_aggregate",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  // -- Aggregation voucher --
  if (paymentRequirements.extra.type === "aggregation") {
    const previousVoucher = paymentRequirements.extra.voucher;
    // id
    if (voucher.id.toLowerCase() !== previousVoucher.id.toLowerCase()) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_id_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // buyer
    if (getAddress(voucher.buyer) !== getAddress(previousVoucher.buyer)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_buyer_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // seller
    if (getAddress(voucher.seller) !== getAddress(previousVoucher.seller)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_seller_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // valueAggregate
    if (BigInt(voucher.valueAggregate) < BigInt(previousVoucher.valueAggregate)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value_aggregate_decreasing",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // asset
    if (getAddress(voucher.asset) !== getAddress(previousVoucher.asset)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_asset_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // timestamp
    if (voucher.timestamp < previousVoucher.timestamp) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_timestamp_decreasing",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // nonce
    if (voucher.nonce !== previousVoucher.nonce + 1) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_nonce_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // escrow
    if (getAddress(voucher.escrow) !== getAddress(previousVoucher.escrow)) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_escrow_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // chainId
    if (voucher.chainId !== previousVoucher.chainId) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_chain_id_mismatch",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
    // expiry
    if (voucher.expiry < previousVoucher.expiry) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_expiry_decreasing",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies the voucher signature is valid
 *
 * - ✅ Verify the voucher signature is valid
 * - ✅ Verify the voucher signer is the buyer
 *
 * @param voucher - The voucher to verify
 * @param signature - The signature of the voucher
 * @returns Verification result
 */
export async function verifyVoucherSignature(
  voucher: DeferredEvmPayloadVoucher,
  signature: string,
): Promise<VerifyResponse> {
  const voucherSignatureIsValid = await verifyVoucher(
    voucher,
    signature as Hex,
    voucher.buyer as Address,
  );
  if (!voucherSignatureIsValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies a voucher is available in the voucher store
 *
 * This function will retrieve voucher (id,nonce) and verify it
 * against the voucher provided.
 *
 * @param voucher - The voucher to verify
 * @param signature - The signature of the voucher
 * @param id - The id of the voucher
 * @param nonce - The nonce of the voucher
 * @param voucherStore - The voucher store to use for verification
 * @returns Verification result
 */
export async function verifyVoucherAvailability(
  voucher: DeferredEvmPayloadVoucher,
  signature: string,
  id: string,
  nonce: number,
  voucherStore: VoucherStore,
): Promise<VerifyResponse> {
  const storeVoucher = await voucherStore.getVoucher(id, nonce);
  if (!storeVoucher) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_not_found",
      payer: voucher.buyer,
    };
  }
  const signedVoucher = DeferredEvmPayloadSignedVoucherSchema.parse({
    ...voucher,
    signature,
  });

  const duplicateResult = verifyVoucherDuplicate(signedVoucher, storeVoucher);
  if (!duplicateResult.isValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_found_not_duplicate",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Verifies two vouchers are the same, down to the signature
 *
 * @param newVoucher - The new voucher to verify
 * @param previousVoucher - The previous voucher to verify against
 * @returns Verification result
 */
export function verifyVoucherDuplicate(
  newVoucher: DeferredEvmPayloadSignedVoucher,
  previousVoucher: DeferredEvmPayloadSignedVoucher,
): VerifyResponse {
  if (
    newVoucher.id.toLowerCase() === previousVoucher.id.toLowerCase() &&
    getAddress(newVoucher.buyer) === getAddress(previousVoucher.buyer) &&
    getAddress(newVoucher.seller) === getAddress(previousVoucher.seller) &&
    newVoucher.valueAggregate === previousVoucher.valueAggregate &&
    getAddress(newVoucher.asset) === getAddress(previousVoucher.asset) &&
    newVoucher.timestamp === previousVoucher.timestamp &&
    newVoucher.nonce === previousVoucher.nonce &&
    getAddress(newVoucher.escrow) === getAddress(previousVoucher.escrow) &&
    newVoucher.chainId === previousVoucher.chainId &&
    newVoucher.expiry === previousVoucher.expiry &&
    newVoucher.signature.toLowerCase() === previousVoucher.signature.toLowerCase()
  ) {
    return {
      isValid: true,
    };
  }

  return {
    isValid: false,
    invalidReason: "invalid_deferred_evm_payload_voucher_not_duplicate",
    payer: newVoucher.buyer,
  };
}

/**
 * Verifies the onchain state allows the payment to be settled
 *
 * - ✅ (on-chain) Verifies the client is connected to the chain specified in the payment requirements
 * - ✅ (on-chain) Verifies buyer has sufficient asset balance
 * - ⌛ TODO: Simulate the transaction to ensure it will succeed
 *
 * @param client - The client to use for the onchain state verification
 * @param voucher - The voucher to verify
 * @returns Verification result
 */
export async function verifyOnchainState<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  voucher: DeferredEvmPayloadVoucher,
): Promise<VerifyResponse> {
  // Verify the client is connected to the chain specified in the payment requirements
  if (client.chain.id !== voucher.chainId) {
    return {
      isValid: false,
      invalidReason: "invalid_client_network",
      payer: voucher.buyer,
    };
  }

  // Verify buyer has sufficient asset balance in the escrow contract
  // buyer has to cover the outstanding amount
  let voucherOutstandingAmount: bigint;
  try {
    [voucherOutstandingAmount] = await client.readContract({
      address: voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "getOutstandingAndCollectableAmount",
      args: [
        {
          id: voucher.id as Hex,
          buyer: voucher.buyer as Address,
          seller: voucher.seller as Address,
          valueAggregate: BigInt(voucher.valueAggregate),
          asset: voucher.asset as Address,
          timestamp: BigInt(voucher.timestamp),
          nonce: BigInt(voucher.nonce),
          escrow: voucher.escrow as Address,
          chainId: BigInt(voucher.chainId),
          expiry: BigInt(voucher.expiry),
        },
      ],
    });
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_outstanding_amount",
      payer: voucher.buyer,
    };
  }
  let buyerAccount: {
    balance: bigint;
    thawingAmount: bigint;
    thawEndTime: bigint;
  };
  try {
    buyerAccount = await client.readContract({
      address: voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "getAccount",
      args: [voucher.buyer as Address, voucher.seller as Address, voucher.asset as Address],
    });
  } catch (error) {
    console.log(error);
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_contract_call_failed_account",
      payer: voucher.buyer,
    };
  }

  if (buyerAccount.balance < voucherOutstandingAmount) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: voucher.buyer,
    };
  }

  return {
    isValid: true,
  };
}
