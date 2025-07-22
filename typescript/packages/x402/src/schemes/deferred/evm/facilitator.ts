import { Account, Address, Chain, Transport, Hex } from "viem";
import { ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import { DeferredPaymentPayloadSchema } from "../../../types/verify/schemes/deferred";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";
import { verifyPaymentRequirements, verifyVoucherSignature, verifyOnchainState } from "./verify";

/**
 * Verifies a payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - ✅ Validates the payment payload matches the payment requirements
 * - ✅ Validates the voucher signature is valid
 * - ✅ Validates the onchain state allows the payment to be settled
 *
 * @param client - The public client used for blockchain interactions
 * @param paymentPayload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Verify payload is a deferred payment payload - plus type assert to DeferredPaymentPayload
  paymentPayload = DeferredPaymentPayloadSchema.parse(paymentPayload);

  // Verify the payment payload matches the payment requirements
  const requirementsResult = await verifyPaymentRequirements(paymentPayload, paymentRequirements);
  if (requirementsResult) {
    return requirementsResult;
  }

  // Verify voucher signature is valid
  const signatureResult = await verifyVoucherSignature(paymentPayload);
  if (signatureResult) {
    return signatureResult;
  }

  // Verify the onchain state allows the payment to be settled
  const onchainResult = await verifyOnchainState(client, paymentPayload, paymentRequirements);
  if (onchainResult) {
    return onchainResult;
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer: paymentPayload.payload.voucher.buyer,
  };
}

/**
 * Settles a payment by executing a collect transaction on the deferred escrow contract
 *
 * This function executes the collect transaction using a signed voucher.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transfer parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // Verify payload is a deferred payment payload - plus type assert to DeferredPaymentPayload
  paymentPayload = DeferredPaymentPayloadSchema.parse(paymentPayload);

  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  const { voucher, signature } = paymentPayload.payload;

  const tx = await wallet.writeContract({
    address: voucher.escrow as Address,
    abi: deferredEscrowABI,
    functionName: "collect" as const,
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
      signature as Hex,
    ],
    chain: wallet.chain as Chain,
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: tx,
      network: paymentPayload.network,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: paymentPayload.payload.voucher.buyer,
  };
}
